import { describe, expect, it, vi } from 'vitest';
import { EventRegistrationSelection } from '../src/domain/entities/event-registration';
import { MemberProfileDraft } from '../src/domain/entities/member-profile';
import { RegisterForEventUseCase } from '../src/application/use-cases/registration.use-cases';
import { ConflictError } from '../src/application/use-cases/errors';
import { PostgresRegistrationRepository } from '../src/infrastructure/repositories/postgres-registration.repository';

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
      availableOfferings: [{ id: '10000000-0000-4000-8000-000000000001', priceCents: 0 }],
      pixAvailable: false,
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
      participantKeys: [], availableOfferings: [], pixAvailable: false,
    })).toThrow('Selecione ao menos uma pessoa');
    expect(() => EventRegistrationSelection.create({
      registrantName: 'João Silva', familyRegistrationEnabled: false,
      offeringIds: ['desconhecido'], availableOfferings: [], pixAvailable: false,
    })).toThrow('adicional indisponível');
  });

  it('exige a autodeclaração quando há adicional pago e PIX vinculado', () => {
    const input = {
      registrantName: 'João Silva',
      familyRegistrationEnabled: false,
      offeringIds: ['10000000-0000-4000-8000-000000000001'],
      availableOfferings: [{ id: '10000000-0000-4000-8000-000000000001', priceCents: 2500 }],
      pixAvailable: true,
    };
    expect(() => EventRegistrationSelection.create(input)).toThrow('Confirme que o PIX foi efetuado');
    expect(EventRegistrationSelection.create({ ...input, pixPaymentDeclared: true }).props.pixPaymentDeclared).toBe(true);
  });

  it('salva WhatsApp e autorização mesmo sem inscrição familiar', async () => {
    const event = {
      id: 'event', publicId: 'public', tenantId: 'tenant', fields: [], offerings: [],
      familyRegistrationEnabled: false, pix: null,
    };
    const register = vi.fn().mockResolvedValue('registration');
    const hasConfirmedRegistration = vi.fn().mockResolvedValue(false);
    const useCase = new RegisterForEventUseCase(
      { resolve: vi.fn().mockResolvedValue(event) } as any,
      { register, hasConfirmedRegistration } as any,
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

  it('ignora uma resposta opcional ausente antes de persistir', async () => {
    const event = {
      id: 'event', publicId: 'public', tenantId: 'tenant', offerings: [],
      familyRegistrationEnabled: false, pix: null,
      fields: [{
        id: 'optional-field', label: 'Observação', type: 'text', required: false,
        options: [], position: 0,
      }],
    };
    const register = vi.fn().mockResolvedValue('registration');
    const hasConfirmedRegistration = vi.fn().mockResolvedValue(false);
    const useCase = new RegisterForEventUseCase(
      { resolve: vi.fn().mockResolvedValue(event) } as any,
      { register, hasConfirmedRegistration } as any,
    );
    const principal = {
      userId: 'member', tenantId: 'tenant', name: 'João Silva', email: 'joao@example.test',
      roles: ['member'], permissions: ['events.register'],
    } as any;

    await useCase.execute(principal, 'public', {
      answers: [{ fieldId: 'optional-field', value: undefined }],
    });

    expect(register.mock.calls[0]![0].answers).toEqual([]);
  });

  it('recusa uma nova confirmação quando o membro já está inscrito', async () => {
    const register = vi.fn();
    const useCase = new RegisterForEventUseCase(
      { resolve: vi.fn().mockResolvedValue({
        id: 'event', publicId: 'public', tenantId: 'tenant', fields: [], offerings: [],
        familyRegistrationEnabled: false, pix: null,
      }) } as any,
      { hasConfirmedRegistration: vi.fn().mockResolvedValue(true), register } as any,
    );
    const principal = {
      userId: 'member', tenantId: 'tenant', name: 'João Silva', email: 'joao@example.test',
      roles: ['member'], permissions: ['events.register'],
    } as any;

    await expect(useCase.execute(principal, 'public', { answers: [] }))
      .rejects.toThrow('Você já está inscrito neste evento');
    expect(register).not.toHaveBeenCalled();
  });

  it('mantém a proteção dentro da transação contra confirmações simultâneas', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        capacity: null, registration_deadline: null, current_form_version: 1, pix_integration_id: null,
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'registration', status: 'confirmed', checked_in: false, participant_count: '1',
      }] });
    const database: any = {
      withTenant: vi.fn(async (_principal: any, work: any) => work({ query })),
    };
    const repository = new PostgresRegistrationRepository(database as any);

    await expect(repository.register({
      principal: {
        userId: 'member', tenantId: 'tenant', name: 'João', email: 'joao@example.test',
        roles: ['member'], permissions: ['events.register'],
      } as any,
      event: { id: 'event', tenantId: 'tenant' } as any,
      answers: [], participants: [{ sourceType: 'registrant', name: 'João' }],
      offeringIds: [], pixPaymentDeclared: false,
    })).rejects.toBeInstanceOf(ConflictError);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
