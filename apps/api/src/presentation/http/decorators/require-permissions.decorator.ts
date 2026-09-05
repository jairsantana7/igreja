import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../../domain/entities/permission';

export const REQUIRED_PERMISSIONS = 'required_permissions';
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
