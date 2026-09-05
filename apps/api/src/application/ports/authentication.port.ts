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

export interface ExternalIdentity {
  provider: string;
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface ExternalIdentityProvider {
  authorizationUrl(state: string, redirectUri: string): Promise<string>;
  exchange(code: string, redirectUri: string): Promise<ExternalIdentity>;
}
