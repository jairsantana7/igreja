import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { CommunicationTemplateChannel, CommunicationTemplateContent, CommunicationTemplatePurpose, CommunicationTemplateStatus, EventReminderConfiguration } from '../../domain/entities/communication-template';

export interface CommunicationTemplateVersionView {
  id: string;
  version: number;
  subject: string;
  body: string;
  variables: string[];
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface CommunicationTemplateView {
  id: string;
  name: string;
  purpose: CommunicationTemplatePurpose;
  channel: CommunicationTemplateChannel;
  status: CommunicationTemplateStatus;
  currentVersion: CommunicationTemplateVersionView;
  versionCount: number;
  updatedAt: string;
}

export interface CommunicationTemplateRepository {
  list(principal: AuthenticatedPrincipal): Promise<CommunicationTemplateView[]>;
  versions(principal: AuthenticatedPrincipal, templateId: string): Promise<CommunicationTemplateVersionView[] | null>;
  create(principal: AuthenticatedPrincipal, content: CommunicationTemplateContent): Promise<CommunicationTemplateView>;
  update(principal: AuthenticatedPrincipal, templateId: string, content: CommunicationTemplateContent): Promise<CommunicationTemplateView | null>;
  setStatus(principal: AuthenticatedPrincipal, templateId: string, status: CommunicationTemplateStatus): Promise<CommunicationTemplateView | null>;
}

export interface EventReminderView {
  id: string;
  eventId: string;
  audience: 'confirmed' | 'checked_in' | 'not_checked_in';
  offsetMinutesBefore: number;
  enabled: boolean;
  scheduledFor: string;
  template: { id: string; name: string; versionId: string; version: number; latestVersion: number; channel: CommunicationTemplateChannel; status: CommunicationTemplateStatus };
  channel: { id: string; displayName: string; phoneNumber: string; status: 'configured' | 'connected' | 'disconnected' };
  createdAt: string;
  updatedAt: string;
}

export type SaveEventReminderResult =
  | { ok: true; value: EventReminderView }
  | { ok: false; reason: 'event_not_found' | 'template_not_active' | 'channel_not_accessible' | 'reminder_not_found' };

export interface EventReminderRepository {
  list(principal: AuthenticatedPrincipal, eventId: string): Promise<EventReminderView[] | null>;
  create(principal: AuthenticatedPrincipal, eventId: string, templateId: string, channelId: string, config: EventReminderConfiguration): Promise<SaveEventReminderResult>;
  update(principal: AuthenticatedPrincipal, eventId: string, reminderId: string, templateId: string, channelId: string, config: EventReminderConfiguration): Promise<SaveEventReminderResult>;
  remove(principal: AuthenticatedPrincipal, eventId: string, reminderId: string): Promise<boolean | null>;
}
