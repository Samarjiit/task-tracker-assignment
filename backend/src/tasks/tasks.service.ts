import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { InvalidStatusTransitionException } from '../common/exceptions/domain.exception';
import { canTransition } from './task-status.machine';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Create ----------

  async create(user: AuthenticatedUser, dto: CreateTaskDto): Promise<Task> {
    await this.assertProjectInOrg(user.organizationId, dto.projectId);
    if (dto.assigneeId) {
      await this.assertUserInOrg(user.organizationId, dto.assigneeId);
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectId: dto.projectId,
        assigneeId: dto.assigneeId ?? null,
        createdById: user.id,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });

    await this.invalidate(user.organizationId, task.assigneeId);
    return task;
  }

  // ---------- List (cached per assignee) ----------

  async findAll(
    user: AuthenticatedUser,
    query: QueryTasksDto,
  ): Promise<PaginatedResult<Task>> {
    // MEMBER is restricted to their own assigned tasks (RBAC row-level rule).
    const effectiveAssigneeId =
      user.role === Role.MEMBER ? user.id : query.assigneeId;

    const where: Prisma.TaskWhereInput = {
      project: { organizationId: user.organizationId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(effectiveAssigneeId ? { assigneeId: effectiveAssigneeId } : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const filterShape = {
      page: query.page,
      limit: query.limit,
      status: query.status ?? null,
      priority: query.priority ?? null,
      sortBy,
      sortOrder,
    };

    // Cache only single-assignee lists — "task list per assignee".
    const cacheable = Boolean(effectiveAssigneeId);
    let cacheKey: string | null = null;
    if (cacheable) {
      const version = await this.redis.getAssigneeVersion(
        user.organizationId,
        effectiveAssigneeId as string,
      );
      cacheKey = this.redis.buildTaskListKey(
        user.organizationId,
        effectiveAssigneeId as string,
        version,
        filterShape,
      );
      const cached = await this.redis.getJson<PaginatedResult<Task>>(cacheKey);
      if (cached) return cached;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: query.limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    const result: PaginatedResult<Task> = {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    if (cacheable && cacheKey) {
      await this.redis.setJson(
        cacheKey,
        result,
        this.config.get<number>('TASK_CACHE_TTL') ?? 60,
      );
    }
    return result;
  }

  // ---------- Read ----------

  async findOne(user: AuthenticatedUser, id: string): Promise<Task> {
    const task = await this.getOwnedTask(user.organizationId, id);
    if (user.role === Role.MEMBER && task.assigneeId !== user.id) {
      throw new ForbiddenException('You can only view tasks assigned to you');
    }
    return task;
  }

  // ---------- Update (fields) ----------

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.getOwnedTask(user.organizationId, id);

    // MEMBERS may only update tasks assigned to them.
    if (user.role === Role.MEMBER && task.assigneeId !== user.id) {
      throw new ForbiddenException('You can only update tasks assigned to you');
    }
    if (dto.assigneeId) {
      await this.assertUserInOrg(user.organizationId, dto.assigneeId);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.assigneeId !== undefined
          ? { assigneeId: dto.assigneeId }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
      },
    });

    // Invalidate both the old and (possibly new) assignee caches.
    await this.invalidate(user.organizationId, task.assigneeId);
    if (updated.assigneeId && updated.assigneeId !== task.assigneeId) {
      await this.invalidate(user.organizationId, updated.assigneeId);
    }
    return updated;
  }

  // ---------- Status transition (state machine + ownership) ----------

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    next: TaskStatus,
  ): Promise<Task> {
    const task = await this.getOwnedTask(user.organizationId, id);
    this.assertCanAdvance(user, task);

    if (!canTransition(task.status, next)) {
      throw new InvalidStatusTransitionException(task.status, next);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: next,
        completedAt: next === TaskStatus.DONE ? new Date() : null,
      },
    });

    await this.invalidate(user.organizationId, task.assigneeId);
    return updated;
  }

  // ---------- Delete ----------

  async remove(user: AuthenticatedUser, id: string) {
    const task = await this.getOwnedTask(user.organizationId, id);
    await this.prisma.task.delete({ where: { id } });
    await this.invalidate(user.organizationId, task.assigneeId);
    return { deleted: true };
  }

  // ---------- Authorization / ownership helpers ----------

  /**
   * Row-level rule: only the assignee, a MANAGER, or an ADMIN may advance
   * a task's status. This depends on the row (assignee) so it cannot be a
   * static role guard — it is enforced here by design.
   */
  private assertCanAdvance(user: AuthenticatedUser, task: Task): void {
    const privileged = user.role === Role.ADMIN || user.role === Role.MANAGER;
    if (!privileged && task.assigneeId !== user.id) {
      throw new ForbiddenException(
        'Only the assignee or a manager can change this task status',
      );
    }
  }

  private async getOwnedTask(organizationId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, project: { organizationId } },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async assertProjectInOrg(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('projectId does not belong to your organization');
    }
  }

  private async assertUserInOrg(organizationId: string, userId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException('assigneeId is not a user in your organization');
    }
  }

  private async invalidate(organizationId: string, assigneeId: string | null) {
    if (assigneeId) {
      await this.redis.bumpAssigneeVersion(organizationId, assigneeId);
    }
  }
}
