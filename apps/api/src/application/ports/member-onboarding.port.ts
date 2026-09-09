import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';

export interface MemberOnboardingRepository {
  create(principal: AuthenticatedPrincipal, input: {
    name: string;
    email: string;
    passwordHash: string;
    roleIds: string[];
    profile?: MemberProfileDraft;
    delivery: MemberOnboardingDeliveryDraft;
  }): Promise<MemberOnboardingCreation>;
  createFromConversation(principal: AuthenticatedPrincipal, input: {
    conversationId: string;
    email: string;
    passwordHash: string;
    delivery: Omit<MemberOnboardingDeliveryDraft, 'phone'>;
  }): Promise<MemberOnboardingCreation | null>;
  listDeliveries(principal: AuthenticatedPrincipal): Promise<MemberOnboardingDeliveryView[]>;
  findDeliverySecret(principal: AuthenticatedPrincipal, deliveryId: string): Promise<{
    encryptedPayload: Buffer;
    status: MemberOnboardingDeliveryView['status'];
    expiresAt: Date;
  } | null>;
  markDeliveryRevealed(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null>;
  markDeliveryDelivered(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null>;
  revokeDelivery(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null>;
  resolvePublicDelivery(deliveryId: string, tokenHash: string): Promise<MemberOnboardingPublicView | null>;
  completePublicDelivery(input: {
    tenantId: string;
    memberUserId: string;
    deliveryId: string;
    tokenHash: string;
    passwordHash: string;
    profile: MemberProfileDraft;
  }): Promise<boolean>;
}

export interface MemberOnboardingDeliveryDraft {
  phone: string;
  tokenHash: string;
  encryptedPayload: Buffer;
  expiresAt: Date;
}

export interface MemberOnboardingCreation {
  id: string;
  name: string;
  email: string;
  delivery: { id: string; expiresAt: string };
}

export interface MemberOnboardingDeliveryView {
  id: string;
  member: { id: string; name: string; email: string };
  phone: string;
  status: 'pending' | 'revealed' | 'delivered' | 'completed' | 'revoked' | 'expired';
  expiresAt: string;
  revealedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface MemberOnboardingPublicView {
  tenantId: string;
  deliveryId: string;
  member: { id: string; name: string; email: string };
  phone: string;
  expiresAt: string;
}
