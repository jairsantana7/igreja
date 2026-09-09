import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TOKENS } from '../../../application/ports/tokens';
import type {
  CompletePublicMemberOnboardingUseCase,
  GetPublicMemberOnboardingUseCase,
  ListMemberOnboardingDeliveriesUseCase,
  MarkMemberOnboardingDeliveryUseCase,
  RevealMemberOnboardingDeliveryUseCase,
  RevokeMemberOnboardingDeliveryUseCase,
} from '../../../application/use-cases/member-onboarding.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CompleteMemberOnboardingDto, MemberOnboardingTokenDto } from '../dto/member-onboarding.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('members/onboarding-deliveries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberOnboardingController {
  constructor(
    @Inject(TOKENS.listMemberDeliveriesUseCase) private readonly listDeliveries: ListMemberOnboardingDeliveriesUseCase,
    @Inject(TOKENS.revealMemberDeliveryUseCase) private readonly revealDelivery: RevealMemberOnboardingDeliveryUseCase,
    @Inject(TOKENS.markMemberDeliveryDeliveredUseCase) private readonly markDelivery: MarkMemberOnboardingDeliveryUseCase,
    @Inject(TOKENS.revokeMemberDeliveryUseCase) private readonly revokeDeliveryUseCase: RevokeMemberOnboardingDeliveryUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.memberCredentialsManage)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listDeliveries.execute(principal);
  }

  @Post(':deliveryId/reveal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.memberCredentialsManage)
  reveal(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('deliveryId', new ParseUUIDPipe()) deliveryId: string) {
    return this.revealDelivery.execute(principal, deliveryId);
  }

  @Put(':deliveryId/delivered')
  @RequirePermissions(PERMISSIONS.memberCredentialsManage)
  markDelivered(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('deliveryId', new ParseUUIDPipe()) deliveryId: string) {
    return this.markDelivery.execute(principal, deliveryId);
  }

  @Delete(':deliveryId')
  @RequirePermissions(PERMISSIONS.memberCredentialsManage)
  revoke(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('deliveryId', new ParseUUIDPipe()) deliveryId: string) {
    return this.revokeDeliveryUseCase.execute(principal, deliveryId);
  }
}

@Controller('public/member-onboarding')
export class PublicMemberOnboardingController {
  constructor(
    @Inject(TOKENS.getPublicMemberOnboardingUseCase) private readonly getOnboarding: GetPublicMemberOnboardingUseCase,
    @Inject(TOKENS.completePublicMemberOnboardingUseCase) private readonly completeOnboarding: CompletePublicMemberOnboardingUseCase,
  ) {}

  @Post(':deliveryId/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  get(@Param('deliveryId', new ParseUUIDPipe()) deliveryId: string, @Body() dto: MemberOnboardingTokenDto) {
    return this.getOnboarding.execute(deliveryId, dto.token);
  }

  @Put(':deliveryId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  complete(@Param('deliveryId', new ParseUUIDPipe()) deliveryId: string, @Body() dto: CompleteMemberOnboardingDto) {
    const { token, ...profile } = dto;
    return this.completeOnboarding.execute(deliveryId, token, profile);
  }
}
