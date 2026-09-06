import { describe, expect, it } from 'vitest';
import { EventRegistrationSelection } from '../src/domain/entities/event-registration';
import { MemberProfileDraft } from '../src/domain/entities/member-profile';

describe('participantes de uma inscrição', () => {
  const profile = MemberProfileDraft.create({
    spouseName: 'Maria Silva',
    children: [{ name: 'Ana Silva', birthDate: '2018-03-02' }],
  });

  it('mantém a conta individual e cria snapshots das pessoas selecionadas', () => {
    const selection = EventRegistrationSelection.create({
      registrantName: 'João Silva',
      familyRegistrationEnabled: true,
      profile,
      participantKeys: ['registrant', 'spouse', 'child:0'],
      offeringIds: ['10000000-0000-4000-8000-000000000001'],
      availableOfferingIds: ['10000000-0000-4000-8000-000000000001'],
    });
    expect(selection.props.participants).toEqual([
      { sourceType: 'registrant', name: 'João Silva' },
      { sourceType: 'spouse', name: 'Maria Silva' },
      { sourceType: 'child', name: 'Ana Silva', birthDate: '2018-03-02' },
    ]);
  });

  it('exige pelo menos uma pessoa e rejeita adicionais desconhecidos', () => {
    expect(() => EventRegistrationSelection.create({
      registrantName: 'João Silva', familyRegistrationEnabled: true, profile,
      participantKeys: [], availableOfferingIds: [],
    })).toThrow('Selecione ao menos uma pessoa');
    expect(() => EventRegistrationSelection.create({
      registrantName: 'João Silva', familyRegistrationEnabled: false,
      offeringIds: ['desconhecido'], availableOfferingIds: [],
    })).toThrow('adicional indisponível');
  });
});
