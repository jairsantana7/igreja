import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { CreateRoleUseCase, CreateUserUseCase, GetAccessControlUseCase } from '../../../application/use-cases/access-control.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateRoleDto, CreateUserDto } from '../dto/access-control.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessControlController {
  constructor(
    @Inject(TOKENS.getAccessControlUseCase) private readonly getAccess: GetAccessControlUseCase,
    @Inject(TOKENS.createRoleUseCase) private readonly createRoleUseCase: CreateRoleUseCase,
    @Inject(TOKENS.createUserUseCase) private readonly createUserUseCase: CreateUserUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.rolesRead)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.getAccess.execute(principal);
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.rolesManage)
  createRole(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateRoleDto) {
    return this.createRoleUseCase.execute(principal, dto);
  }

  @Post('users')
  @RequirePermissions(PERMISSIONS.usersCreate)
  createUser(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateUserDto) {
    return this.createUserUseCase.execute(principal, dto);
  }
}
