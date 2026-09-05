import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { TOKENS } from '../../../application/ports/tokens';
import { LoginDto } from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(TOKENS.loginUseCase) private readonly login: LoginUseCase) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  execute(@Body() dto: LoginDto) {
    return this.login.execute(dto);
  }
}
