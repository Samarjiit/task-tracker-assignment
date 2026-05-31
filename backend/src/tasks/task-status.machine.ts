import { TaskStatus } from '@prisma/client';

/**
 * Server-side task status state machine.
 *
 *   TODO        -> IN_PROGRESS, BLOCKED
 *   IN_PROGRESS -> IN_REVIEW,   BLOCKED
 *   IN_REVIEW   -> DONE, IN_PROGRESS, BLOCKED
 *   BLOCKED     -> IN_PROGRESS, TODO        (un-block)
 *   DONE        -> (terminal)
 *
 * BLOCKED is reachable from any active state.
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.BLOCKED],
  [TaskStatus.IN_REVIEW]: [
    TaskStatus.DONE,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.TODO],
  [TaskStatus.DONE]: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
