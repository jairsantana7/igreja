import { createHmac, randomBytes } from 'node:crypto';
import type { SessionClientContext, SessionSecurity, SessionVerification } from '../../application/ports/authentication.port';
import { env } from '../config/env';

export class HmacSessionSecurity implements SessionSecurity {
  issue(context: SessionClientContext) {
    const proof = randomBytes(32).toString('base64url');
    return { proof, ...this.hashes(proof, context) };
  }

  verify(proof: string, context: SessionClientContext): SessionVerification | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(proof)) return null;
    return this.hashes(proof, context);
  }

  private hashes(proof: string, context: SessionClientContext): SessionVerification {
    return {
      proofHash: this.hmac('proof', proof),
      userAgentHash: this.hmac('user-agent', context.userAgent.trim().slice(0, 512) || 'unknown'),
    };
  }

  private hmac(label: string, value: string): string {
    return createHmac('sha256', env.sessionBindingSecret).update(label).update('\0').update(value).digest('hex');
  }
}
