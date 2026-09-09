import { describe, expect, it, vi } from 'vitest';
import { EventRegistrationSelection } from '../src/domain/entities/event-registration';
import { MemberProfileDraft } from '../src/domain/entities/member-profile';
import { RegisterForEventUseCase } from '../src/application/use-cases/registration.use-cases';

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

  it('salva WhatsApp e autorização mesmo sem inscrição familiar', async () => {
    const event = {
      id: 'event', publicId: 'public', tenantId: 'tenant', fields: [], offerings: [],
      familyRegistrationEnabled: false,
    };
    const register = vi.fn().mockResolvedValue('registration');
    const useCase = new RegisterForEventUseCase(
      { resolve: vi.fn().mockResolvedValue(event) } as any,
      { register } as any,
    );
    const principal = {
      userId: 'member', tenantId: 'tenant', name: 'João Silva', email: 'joao@example.test',
      roles: ['member'], permissions: ['events.register'],
    } as any;

    await useCase.execute(principal, 'public', {
      answers: [],
      profile: {
        phone: '+5513999999999',
        whatsappCommunicationOptIn: true,
        spouseName: 'Não deve ser aceito sem opção familiar',
      },
    });

    const persisted = register.mock.calls[0]![0].profile as MemberProfileDraft;
    expect(persisted.props).toMatchObject({
      phone: '+5513999999999', whatsappCommunicationOptIn: true, spouseName: undefined,
    });
  });
});
