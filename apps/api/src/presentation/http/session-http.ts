import type { Request, Response } from 'express';
import type { SessionClientContext } from '../../application/ports/authentication.port';
import { env } from '../../infrastructure/config/env';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';

export const SESSION_COOKIE_NAME = env.nodeEnv === 'production' ? '__Host-community_session' : 'community_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export interface BrowserSessionResult {
  accessToken: string;
  sessionProof: string;
  user: AuthenticatedPrincipal;
  registrationId?: string;
}

export function clientSessionContext(request: Request): SessionClientContext {
  return { userAgent: request.get('user-agent') ?? 'unknown' };
}

export function establishBrowserSession(response: Response, result: BrowserSessionResult) {
  response.setHeader('Cache-Control', 'no-store');
  response.cookie(SESSION_COOKIE_NAME, result.accessToken, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  });
  const { accessToken: _accessToken, user, ...browserResult } = result;
  const { sessionId: _sessionId, ...safeUser } = user;
  return { ...browserResult, user: safeUser };
}

export function clearBrowserSession(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  for (const part of cookieHeader?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}
