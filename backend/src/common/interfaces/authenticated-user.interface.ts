import { Role } from '@prisma/client';

/** Shape attached to `request.user` by the JWT strategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  organizationId: string;
}
