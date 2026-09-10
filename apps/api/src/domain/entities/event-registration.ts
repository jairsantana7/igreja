import { DomainError } from './errors';
import type { MemberProfileDraft } from './member-profile';

export type RegistrationParticipantSource = 'registrant' | 'spouse' | 'child';

export interface RegistrationParticipantSnapshot {
  sourceType: RegistrationParticipantSource;
  name: string;
  birthDate?: string;
}

export class EventRegistrationSelection {
  private constructor(readonly props: {
    participants: RegistrationParticipantSnapshot[];
    offeringIds: string[];
    pixPaymentDeclared: boolean;
  }) {}

  static create(input: {
    registrantName: string;
    familyRegistrationEnabled: boolean;
    profile?: MemberProfileDraft;
    participantKeys?: string[];
    offeringIds?: string[];
    availableOfferings: Array<{ id: string; priceCents: number }>;
    pixAvailable: boolean;
    pixPaymentDeclared?: boolean;
  }) {
    const candidates = new Map<string, RegistrationParticipantSnapshot>([
      ['registrant', { sourceType: 'registrant', name: input.registrantName.trim() }],
    ]);
    if (input.familyRegistrationEnabled) {
      if (!input.profile) throw new DomainError('Revise os dados da família antes de confirmar.');
      if (input.profile.props.spouseName) candidates.set('spouse', { sourceType: 'spouse', name: input.profile.props.spouseName });
      input.profile.props.children.forEach((child, index) => candidates.set(`child:${index}`, {
        sourceType: 'child', name: child.name, birthDate: child.birthDate,
      }));
    }

    const keys = input.familyRegistrationEnabled ? [...new Set(input.participantKeys ?? [])] : ['registrant'];
    if (!keys.length) throw new DomainError('Selecione ao menos uma pessoa para participar do evento.');
    if (keys.length > 50) throw new DomainError('Uma inscrição aceita no máximo 50 participantes.');
    const participants = keys.map((key) => {
      const participant = candidates.get(key);
      if (!participant) throw new DomainError('A seleção de participantes contém uma pessoa desconhecida.');
      return participant;
    });

    const offeringIds = [...new Set(input.offeringIds ?? [])];
    if (offeringIds.some((id) => !input.availableOfferings.some((offering) => offering.id === id))) {
      throw new DomainError('A seleção contém um adicional indisponível para este evento.');
    }
    const requiresManualPix = input.pixAvailable && input.availableOfferings
      .some((offering) => offeringIds.includes(offering.id) && offering.priceCents > 0);
    if (requiresManualPix && !input.pixPaymentDeclared) {
      throw new DomainError('Confirme que o PIX foi efetuado para concluir a inscrição com itens pagos.');
    }
    return new EventRegistrationSelection({
      participants,
      offeringIds,
      pixPaymentDeclared: requiresManualPix && Boolean(input.pixPaymentDeclared),
    });
  }
}
