import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IsFutureDate } from '../../common/validators/is-future-date.validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateTaskDto {
  @ApiProperty({ example: 'Design landing page' })
  @IsString()
  @MinLength(1, { message: 'title is required' })
  title: string;

  @ApiPropertyOptional({ example: 'Hero + pricing sections' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({ description: 'Project the task belongs to' })
  @IsString()
  @Matches(UUID_RE, { message: 'projectId must be a valid UUID' })
  projectId: string;

  @ApiPropertyOptional({ description: 'Assignee user id (same organization)' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'assigneeId must be a valid UUID' })
  assigneeId?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    description: 'ISO date; must be in the future',
  })
  @IsOptional()
  @IsFutureDate()
  dueDate?: string;
}
