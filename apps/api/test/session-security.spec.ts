import { describe, expect, it, vi } from 'vitest';
import { HmacSessionSecurity } from '../src/infrastructure/security/hmac-session-security';
import { establishBrowserSession, readCookie, SESSION_COOKIE_NAME } from '../src/presentation/http/session-http';
import { JwtAuthGuard } from '../src/presentation/http/guards/jwt-auth.guard';

describe('proteção de sessão do navegador', () => {
  const security = new HmacSessionSecurity();

  it('emite prova aleatória e persiste somente hashes estáveis', () => {
    const first = security.issue({ userAgent: 'Browser A' });
    const second = security.issue({ userAgent: 'Browser A' });
    expect(first.proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.proof).not.toBe(second.proof);
    expect(first.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.userAgentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(security.verify(first.proof, { userAgent: 'Browser A' })).toEqual({
      proofHash: first.proofHash,
      userAgentHash: first.userAgentHash,
    });
  });

  it('altera a assinatura quando muda o navegador e rejeita prova malformada', () => {
    const issued = security.issue({ userAgent: 'Browser A' });
    expect(security.verify(issued.proof, { userAgent: 'Browser B' })?.userAgentHash).not.toBe(issued.userAgentHash);
    expect(security.verify('curta', { userAgent: 'Browser A' })).toBeNull();
  });
});

describe('transporte da sessão', () => {
  it('coloca o JWT somente em cookie HttpOnly e remove identificadores da resposta', () => {
    const response = { setHeader: vi.fn(), cookie: vi.fn() };
    const browser = establishBrowserSession(response as any, {
      accessToken: 'jwt-secreto', sessionProof: 'prova',
      user: { userId: 'user', tenantId: 'tenant', name: 'Nome', email: 'email@test', roles: [], permissions: [], sessionId: 'session-id' },
    });
    expect(response.cookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'jwt-secreto', expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
    expect(browser).not.toHaveProperty('accessToken');
    expect(browser.user).not.toHaveProperty('sessionId');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('exige cookie, prova e assinatura correspondente no guard', async () => {
    const principal = { userId: 'user', tenantId: 'tenant', name: 'Nome', email: 'email@test', roles: [], permissions: [], sessionId: 'session' };
    const tokens = { verify: vi.fn().mockResolvedValue(principal) };
    const sessions = { isActive: vi.fn().mockResolvedValue(true) };
    const security = { verify: vi.fn().mockReturnValue({ proofHash: 'a'.repeat(64), userAgentHash: 'b'.repeat(64) }) };
    const guard = new JwtAuthGuard(tokens as any, sessions as any, security as any);
    const request: any = { headers: { cookie: `${SESSION_COOKIE_NAME}=jwt`, 'x-session-proof': 'proof', 'user-agent': 'Browser' } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.principal).toEqual(principal);
    expect(readCookie(request.headers.cookie, SESSION_COOKIE_NAME)).toBe('jwt');
    request.headers['x-session-proof'] = undefined;
    await expect(guard.canActivate(context)).rejects.toThrow('Autenticação necessária');
  });
});
