import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { TOKENS } from '../../../application/ports/tokens';
import { LoginDto } from '../dto/auth.dto';
import { clientSessionContext, establishBrowserSession } from '../session-http';

@Controller('auth')
export class AuthController {
  constructor(@Inject(TOKENS.loginUseCase) private readonly login: LoginUseCase) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async execute(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.login.execute(dto, clientSessionContext(request));
    return establishBrowserSession(response, result);
  }
}
