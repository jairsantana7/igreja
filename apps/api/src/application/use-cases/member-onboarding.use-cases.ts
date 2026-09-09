import { MemberProfileDraft } from '../../domain/entities/member-profile';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { PasswordHasher } from '../ports/authentication.port';
import type { MemberOnboardingRepository } from '../ports/member-onboarding.port';
import type { MemberOnboardingSecurity } from '../ports/member-onboarding-security.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

function requireCredentialManagement(principal: AuthenticatedPrincipal) {
  if (!principal.permissions.includes(PERMISSIONS.memberCredentialsManage)) {
    throw new AuthorizationError('Você não tem permissão para administrar entregas de acesso.');
  }
}

export class ListMemberOnboardingDeliveriesUseCase {
  constructor(private readonly onboarding: MemberOnboardingRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requireCredentialManagement(principal);
    return this.onboarding.listDeliveries(principal);
  }
}

export class RevealMemberOnboardingDeliveryUseCase {
  constructor(
    private readonly onboarding: MemberOnboardingRepository,
    private readonly security: MemberOnboardingSecurity,
  ) {}

  async execute(principal: AuthenticatedPrincipal, deliveryId: string) {
    requireCredentialManagement(principal);
    const delivery = await this.onboarding.findDeliverySecret(principal, deliveryId);
    if (!delivery) throw new NotFoundError('Entrega de acesso não encontrada.');
    if (delivery.expiresAt <= new Date()) throw new ConflictError('Esta entrega expirou e não pode mais ser revelada.');
    if (!['pending', 'revealed', 'delivered'].includes(delivery.status)) {
      throw new ConflictError('Esta entrega não possui mais credenciais disponíveis.');
    }
    const marked = await this.onboarding.markDeliveryRevealed(principal, deliveryId);
    if (!marked) throw new ConflictError('Esta entrega expirou ou não está mais disponível.');
    const secret = this.security.reveal(delivery.encryptedPayload);
    return {
      temporaryPassword: secret.temporaryPassword,
      registrationPath: `/cadastro/${deliveryId}#${encodeURIComponent(secret.invitationToken)}`,
    };
  }
}

export class MarkMemberOnboardingDeliveryUseCase {
  constructor(private readonly onboarding: MemberOnboardingRepository) {}
  async execute(principal: AuthenticatedPrincipal, deliveryId: string) {
    requireCredentialManagement(principal);
    const delivery = await this.onboarding.markDeliveryDelivered(principal, deliveryId);
    if (!delivery) throw new NotFoundError('Entrega de acesso não encontrada ou indisponível.');
    return delivery;
  }
}

export class RevokeMemberOnboardingDeliveryUseCase {
  constructor(private readonly onboarding: MemberOnboardingRepository) {}
  async execute(principal: AuthenticatedPrincipal, deliveryId: string) {
    requireCredentialManagement(principal);
    const delivery = await this.onboarding.revokeDelivery(principal, deliveryId);
    if (!delivery) throw new NotFoundError('Entrega de acesso não encontrada ou indisponível.');
    return delivery;
  }
}

export class GetPublicMemberOnboardingUseCase {
  constructor(
    private readonly onboarding: MemberOnboardingRepository,
    private readonly security: MemberOnboardingSecurity,
  ) {}
  async execute(deliveryId: string, token: string) {
    const delivery = await this.onboarding.resolvePublicDelivery(deliveryId, this.security.hashToken(token));
    if (!delivery) throw new NotFoundError('Este link de atualização é inválido ou expirou.');
    return {
      member: delivery.member,
      phone: delivery.phone,
      expiresAt: delivery.expiresAt,
    };
  }
}

export class CompletePublicMemberOnboardingUseCase {
  constructor(
    private readonly onboarding: MemberOnboardingRepository,
    private readonly security: MemberOnboardingSecurity,
    private readonly passwords: PasswordHasher,
  ) {}
  async execute(deliveryId: string, token: string, input: {
    password: string;
    phone?: string;
    birthDate?: string;
    spouseName?: string;
    marriageDate?: string;
    whatsappCommunicationOptIn?: boolean;
    address?: { postalCode?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string };
    children?: Array<{ name: string; birthDate?: string }>;
  }) {
    const tokenHash = this.security.hashToken(token);
    const delivery = await this.onboarding.resolvePublicDelivery(deliveryId, tokenHash);
    if (!delivery) throw new NotFoundError('Este link de atualização é inválido ou expirou.');
    const profile = MemberProfileDraft.create({ ...input, phone: input.phone ?? delivery.phone });
    const completed = await this.onboarding.completePublicDelivery({
      tenantId: delivery.tenantId,
      memberUserId: delivery.member.id,
      deliveryId,
      tokenHash,
      passwordHash: await this.passwords.hash(input.password),
      profile,
    });
    if (!completed) throw new ConflictError('Este link já foi utilizado, revogado ou expirou.');
    return { completed: true };
  }
}
