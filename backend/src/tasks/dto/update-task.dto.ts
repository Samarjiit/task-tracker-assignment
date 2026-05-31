import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Update allows changing all create fields EXCEPT projectId (a task does not
 * move between projects) and status (status changes go through /tasks/:id/status).
 */
export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['projectId'] as const),
) {}
