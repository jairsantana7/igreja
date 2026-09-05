import type { AuthenticatedPrincipal, Permission } from '../../domain/entities/permission';

export interface LoginIdentity {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  roles: string[];
  permissions: Permission[];
}

export interface AuthenticationRepository {
  findForLogin(tenantSlug: string, email: string): Promise<LoginIdentity | null>;
  findForTenantLogin(tenantId: string, email: string): Promise<LoginIdentity | null>;
}

export interface PasswordHasher {
  verify(plainText: string, hash: string): Promise<boolean>;
  hash(plainText: string): Promise<string>;
}

export interface TokenService {
  sign(principal: AuthenticatedPrincipal): Promise<string>;
  verify(token: string): Promise<AuthenticatedPrincipal>;
}

export interface SessionView {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionRepository {
  create(principal: AuthenticatedPrincipal): Promise<string>;
  isActive(principal: AuthenticatedPrincipal): Promise<boolean>;
  list(principal: AuthenticatedPrincipal): Promise<SessionView[]>;
  revokeOthers(principal: AuthenticatedPrincipal): Promise<number>;
  revokeCurrent(principal: AuthenticatedPrincipal): Promise<boolean>;
}

export interface MultiFactorChallenge {
  challengeId: string;
  expiresAt: string;
}

export interface MultiFactorProvider {
  readonly providerKey: string;
  createChallenge(input: { tenantId: string; userId: string }): Promise<MultiFactorChallenge>;
  verifyChallenge(input: { challengeId: string; response: string }): Promise<boolean>;
}

export interface ExternalIdentity {
  provider: string;
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface ExternalIdentityProvider {
  readonly providerKey: string;
  authorizationUrl(state: string, redirectUri: string): Promise<string>;
  exchange(code: string, redirectUri: string): Promise<ExternalIdentity>;
}
