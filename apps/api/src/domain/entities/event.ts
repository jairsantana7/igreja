import { DomainError } from './errors';

export const FORM_FIELD_TYPES = ['short_text', 'long_text', 'single_choice', 'checkbox'] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export const EVENT_STATUSES = ['draft', 'published', 'registration_closed', 'cancelled', 'completed'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_MEDIA_DISPLAY_MODES = ['hero', 'carousel', 'fixed'] as const;
export type EventMediaDisplayMode = (typeof EVENT_MEDIA_DISPLAY_MODES)[number];

export function isRegistrationOpen(
  event: { status: EventStatus; startsAt: Date; registrationDeadline?: Date | null },
  now = new Date(),
): boolean {
  return event.status === 'published'
    && event.startsAt > now
    && (!event.registrationDeadline || event.registrationDeadline > now);
}

export type EventLifecycleAction = 'close_registrations' | 'cancel' | 'complete';

export function canTransitionEvent(status: EventStatus, action: EventLifecycleAction): boolean {
  if (action === 'close_registrations') return status === 'published' || status === 'registration_closed';
  if (action === 'cancel') return ['draft', 'published', 'registration_closed', 'cancelled'].includes(status);
  return ['published', 'registration_closed', 'completed'].includes(status);
}

export interface EventFormField {
  id?: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

export interface EventOffering {
  id?: string;
  key: string;
  name: string;
  description: string;
  priceCents: number;
}

export interface EventDraftProps {
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  registrationDeadline?: Date;
  capacity?: number;
  mediaDisplayMode: EventMediaDisplayMode;
  familyRegistrationEnabled: boolean;
  publish: boolean;
  fields: EventFormField[];
  offerings: EventOffering[];
}

export class EventDraft {
  private constructor(readonly props: EventDraftProps) {}

  static create(input: EventDraftProps): EventDraft {
    const title = input.title.trim();
    if (title.length < 3 || title.length > 160) throw new DomainError('O título deve ter entre 3 e 160 caracteres.');
    if (Number.isNaN(input.startsAt.getTime())) throw new DomainError('A data do evento é inválida.');
    if (input.registrationDeadline && input.registrationDeadline > input.startsAt) {
      throw new DomainError('O limite de inscrição não pode ser posterior ao início do evento.');
    }
    if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
      throw new DomainError('A capacidade deve ser um número inteiro positivo.');
    }
    if (!EVENT_MEDIA_DISPLAY_MODES.includes(input.mediaDisplayMode)) {
      throw new DomainError('O modo de exibição das imagens é inválido.');
    }

    const keys = new Set<string>();
    const fields = input.fields.map((field) => {
      const key = field.key.trim().toLowerCase();
      const label = field.label.trim();
      if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) throw new DomainError(`A chave de campo “${field.key}” é inválida.`);
      if (keys.has(key)) throw new DomainError(`A chave de campo “${key}” está duplicada.`);
      if (label.length < 2 || label.length > 120) throw new DomainError('O rótulo do campo deve ter entre 2 e 120 caracteres.');
      if (field.type === 'single_choice' && field.options.filter(Boolean).length === 0) {
        throw new DomainError(`O campo “${label}” precisa de opções.`);
      }
      keys.add(key);
      return { ...field, key, label, options: field.options.map((option) => option.trim()).filter(Boolean) };
    });

    const offeringKeys = new Set<string>();
    const offerings = input.offerings.map((offering) => {
      const key = offering.key.trim().toLowerCase();
      const name = offering.name.trim();
      const description = offering.description.trim();
      if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) throw new DomainError(`A chave do adicional “${offering.key}” é inválida.`);
      if (offeringKeys.has(key)) throw new DomainError(`A chave do adicional “${key}” está duplicada.`);
      if (name.length < 2 || name.length > 120) throw new DomainError('O nome do adicional deve ter entre 2 e 120 caracteres.');
      if (description.length > 1_000) throw new DomainError('A descrição do adicional deve ter no máximo 1.000 caracteres.');
      if (!Number.isInteger(offering.priceCents) || offering.priceCents < 0 || offering.priceCents > 100_000_000) {
        throw new DomainError('O preço do adicional é inválido.');
      }
      offeringKeys.add(key);
      return { ...offering, key, name, description };
    });
    if (offerings.length > 20) throw new DomainError('Um evento aceita no máximo 20 adicionais.');

    return new EventDraft({
      ...input,
      title,
      description: input.description.trim(),
      location: input.location.trim(),
      fields,
      offerings,
    });
  }
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}
