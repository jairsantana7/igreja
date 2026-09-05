import { describe, expect, it, vi } from 'vitest';
import { CommunicationTemplateContent } from '../src/domain/entities/communication-template';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { CommunicationTemplateRepository, EventReminderRepository } from '../src/application/ports/communication-template.port';
import { CreateCommunicationTemplateUseCase, CreateEventReminderUseCase, ListCommunicationTemplatesUseCase, UpdateCommunicationTemplateUseCase } from '../src/application/use-cases/communication-template.use-cases';
import { AuthorizationError, ConflictError } from '../src/application/use-cases/errors';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});
const input = { name: 'Lembrete', purpose: 'event_reminder' as const, channel: 'whatsapp' as const, subject: '', body: 'Olá, {{membro.nome}}! O evento {{evento.nome}} está chegando.' };

describe('modelos de comunicação', () => {
  it('aceita somente variáveis documentadas', () => {
    expect(CommunicationTemplateContent.create(input).props.variables).toEqual(['membro.nome', 'evento.nome']);
    expect(() => CommunicationTemplateContent.create({ ...input, body: 'Olá, {{usuario.senha}}' })).toThrow('Variáveis não reconhecidas');
  });

  it('exige assunto apenas para e-mail', () => {
    expect(() => CommunicationTemplateContent.create({ ...input, channel: 'email', subject: '' })).toThrow('assunto');
    expect(CommunicationTemplateContent.create({ ...input, channel: 'email', subject: 'Seu evento' }).props.subject).toBe('Seu evento');
  });

  it('protege leitura e escrita com permissões distintas', async () => {
    const repository = { list: vi.fn(), create: vi.fn() } as unknown as CommunicationTemplateRepository;
    expect(() => new ListCommunicationTemplatesUseCase(repository).execute(principal([]))).toThrow(AuthorizationError);
    expect(() => new CreateCommunicationTemplateUseCase(repository).execute(principal(['communications.templates_read']), input)).toThrow(AuthorizationError);
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('entrega conteúdo validado ao repositório ao criar nova versão', async () => {
    const repository = { update: vi.fn().mockResolvedValue({ id: 'template', currentVersion: { version: 2 } }) } as unknown as CommunicationTemplateRepository;
    const result = await new UpdateCommunicationTemplateUseCase(repository).execute(principal(['communications.templates_manage']), 'template', input);
    expect(repository.update).toHaveBeenCalledWith(expect.anything(), 'template', expect.any(CommunicationTemplateContent));
    expect(result.currentVersion.version).toBe(2);
  });
});

describe('lembretes do evento', () => {
  it('valida antecedência antes de persistir', async () => {
    const repository = { create: vi.fn() } as unknown as EventReminderRepository;
    const useCase = new CreateEventReminderUseCase(repository);
    await expect(useCase.execute(principal(['events.reminders_manage']), 'event', { templateId: 'template', channelId: 'channel', audience: 'confirmed', offsetMinutesBefore: 5, enabled: true })).rejects.toThrow('antecedência');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('não permite vincular modelo pausado', async () => {
    const repository = { create: vi.fn().mockResolvedValue({ ok: false, reason: 'template_not_active' }) } as unknown as EventReminderRepository;
    const useCase = new CreateEventReminderUseCase(repository);
    await expect(useCase.execute(principal(['events.reminders_manage']), 'event', { templateId: 'template', channelId: 'channel', audience: 'confirmed', offsetMinutesBefore: 1440, enabled: true })).rejects.toThrow(ConflictError);
  });
});
