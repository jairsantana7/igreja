import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { env } from '../../../infrastructure/config/env';

@Controller('health')
export class HealthController {
  @Get()
  @SkipThrottle()
  check() {
    return { status: 'ok', application: env.appName };
  }
}
