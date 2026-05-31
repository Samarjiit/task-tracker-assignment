import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles allowed to access a route. Read by RolesGuard.
 * RBAC is enforced here at the metadata/guard level — never inside controllers.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
