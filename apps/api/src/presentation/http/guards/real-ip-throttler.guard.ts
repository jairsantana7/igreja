import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, any>): Promise<string> {
    const ip = request.ip ?? request.socket?.remoteAddress;
    return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
  }
}
