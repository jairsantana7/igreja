import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { TOKENS } from '../../../application/ports/tokens';
import type { LoginUseCase } from '../../../application/use-cases/login.use-case';
import type { GetPublicEventUseCase } from '../../../application/use-cases/event.use-cases';
import type { RegisterForEventUseCase, SignUpForEventUseCase } from '../../../application/use-cases/registration.use-cases';
import type { AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { EventLoginDto, EventSignUpDto, RegistrationDto } from '../dto/auth.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../../domain/entities/permission';
import { clientSessionContext, establishBrowserSession } from '../session-http';

@Controller('public/events')
export class PublicEventsController {
  constructor(
    @Inject(TOKENS.publicEventUseCase) private readonly publicEvent: GetPublicEventUseCase,
    @Inject(TOKENS.loginUseCase) private readonly login: LoginUseCase,
    @Inject(TOKENS.signUpForEventUseCase) private readonly signUp: SignUpForEventUseCase,
    @Inject(TOKENS.registerForEventUseCase) private readonly register: RegisterForEventUseCase,
  ) {}

  @Get(':publicId')
  getEvent(@Param('publicId', new ParseUUIDPipe()) publicId: string) {
    return this.publicEvent.execute(publicId);
  }

  @Post(':publicId/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async eventLogin(@Param('publicId', new ParseUUIDPipe()) publicId: string, @Body() dto: EventLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const event = await this.publicEvent.resolve(publicId);
    const result = await this.login.executeForTenant({ tenantId: event.tenantId, ...dto }, clientSessionContext(request));
    return establishBrowserSession(response, result);
  }

  @Post(':publicId/signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async eventSignUp(@Param('publicId', new ParseUUIDPipe()) publicId: string, @Body() dto: EventSignUpDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.signUp.execute({ publicId, ...dto }, clientSessionContext(request));
    return establishBrowserSession(response, result);
  }

  @Post(':publicId/registrations')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.eventsRegister)
  eventRegistration(
    @Param('publicId', new ParseUUIDPipe()) publicId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: RegistrationDto,
  ) {
    return this.register.execute(principal, publicId, dto.answers);
  }
}
