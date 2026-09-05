import { jwtVerify, SignJWT } from 'jose';
import type { TokenService } from '../../application/ports/authentication.port';
import type { AuthenticatedPrincipal, Permission } from '../../domain/entities/permission';
import { env } from '../config/env';

export class JoseTokenService implements TokenService {
  private readonly secret = new TextEncoder().encode(env.jwtSecret);

  async sign(principal: AuthenticatedPrincipal): Promise<string> {
    return new SignJWT({
      tenantId: principal.tenantId,
      name: principal.name,
      email: principal.email,
      roles: principal.roles,
      permissions: principal.permissions,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(principal.userId)
      .setIssuer(env.jwtIssuer)
      .setAudience(env.jwtAudience)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.secret);
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.tenantId !== 'string' || typeof payload.name !== 'string' || typeof payload.email !== 'string') {
      throw new Error('Token inválido.');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      name: payload.name,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === 'string') : [],
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions.filter((permission): permission is Permission => typeof permission === 'string')
        : [],
    };
  }
}
