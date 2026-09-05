import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { WhatsAppTemplateProjection } from '../../domain/entities/whatsapp-template';

export interface WhatsAppTemplateChannel {
  id: string;
  providerKey: string;
  providerAccountId: string;
  secretReference: string | null;
}

export interface WhatsAppTemplateView {
  id: string;
  channelId: string;
  providerTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string | null;
  variables: string[];
  updatedAt: string;
}

export interface WhatsAppTemplateProvider {
  readonly providerKey: string;
  list(channel: WhatsAppTemplateChannel): Promise<WhatsAppTemplateProjection[]>;
}

export interface WhatsAppTemplateRepository {
  findChannel(principal: AuthenticatedPrincipal, channelId: string): Promise<WhatsAppTemplateChannel | null>;
  list(principal: AuthenticatedPrincipal, channelId: string): Promise<WhatsAppTemplateView[] | null>;
  synchronize(principal: AuthenticatedPrincipal, channelId: string, templates: WhatsAppTemplateProjection[]): Promise<WhatsAppTemplateView[] | null>;
}
