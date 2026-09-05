import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { CreateRoleUseCase, CreateUserUseCase, GetAccessControlUseCase, ListMembersUseCase, UpdateRolePermissionsUseCase } from '../../../application/use-cases/access-control.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateRoleDto, CreateUserDto, UpdateRolePermissionsDto } from '../dto/access-control.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessControlController {
  constructor(
    @Inject(TOKENS.getAccessControlUseCase) private readonly getAccess: GetAccessControlUseCase,
    @Inject(TOKENS.listMembersUseCase) private readonly listMembersUseCase: ListMembersUseCase,
    @Inject(TOKENS.createRoleUseCase) private readonly createRoleUseCase: CreateRoleUseCase,
    @Inject(TOKENS.updateRolePermissionsUseCase) private readonly updateRoleUseCase: UpdateRolePermissionsUseCase,
    @Inject(TOKENS.createUserUseCase) private readonly createUserUseCase: CreateUserUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.rolesRead)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.getAccess.execute(principal);
  }

  @Put('roles/:roleId')
  @RequirePermissions(PERMISSIONS.rolesManage)
  updateRole(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.updateRoleUseCase.execute(principal, roleId, dto.permissions);
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.usersRead)
  listMembers(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listMembersUseCase.execute(principal);
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
