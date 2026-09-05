import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../../domain/entities/permission';

export const REQUIRED_PERMISSIONS = 'required_permissions';
export const ANY_REQUIRED_PERMISSIONS = 'any_required_permissions';
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const RequireAnyPermission = (...permissions: Permission[]) => SetMetadata(ANY_REQUIRED_PERMISSIONS, permissions);
