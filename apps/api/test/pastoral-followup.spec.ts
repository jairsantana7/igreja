import { describe, expect, it, vi } from 'vitest';
import type { PastoralFollowupRepository } from '../src/application/ports/pastoral-followup.port';
import { AddFollowupNoteUseCase, CreateFollowupStageUseCase, ListFollowupBoardUseCase, MoveFollowupUseCase, UpdateFollowupUseCase } from '../src/application/use-cases/pastoral-followup.use-cases';
import { AuthorizationError, NotFoundError } from '../src/application/use-cases/errors';
import { FollowupNoteContent, FollowupStageDefinition, FollowupTagDefinition } from '../src/domain/entities/pastoral-followup';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});

describe('acompanhamento pastoral', () => {
  it('valida etapa, etiqueta e nota no domínio', () => {
    expect(FollowupStageDefinition.create({ name: ' Acolhimento ', color: '#378661' }).props.name).toBe('Acolhimento');
    expect(FollowupTagDefinition.create({ name: ' Visitante ', color: '#3b82f6' }).props.color).toBe('#3B82F6');
    expect(() => FollowupNoteContent.create({ body: ' ', visibility: 'private' })).toThrow();
  });

  it('exige acesso de leitura para abrir o quadro', () => {
    const board = vi.fn();
    const useCase = new ListFollowupBoardUseCase({ board } as unknown as PastoralFollowupRepository);
    expect(() => useCase.execute(principal([]))).toThrow(AuthorizationError);
    expect(board).not.toHaveBeenCalled();
  });

  it('separa a administração do pipeline da gestão dos cartões', () => {
    const createStage = vi.fn();
    const useCase = new CreateFollowupStageUseCase({ createStage } as unknown as PastoralFollowupRepository);
    expect(() => useCase.execute(principal(['followups.manage']), { name: 'Nova etapa', color: '#378661' })).toThrow(AuthorizationError);
  });

  it('não mascara acompanhamento ausente ao mover', async () => {
    const repository = { move: vi.fn().mockResolvedValue(null) };
    const useCase = new MoveFollowupUseCase(repository as unknown as PastoralFollowupRepository);
    await expect(useCase.execute(principal(['followups.manage']), 'followup', 'stage')).rejects.toThrow(NotFoundError);
  });

  it('normaliza a próxima ação e remove etiquetas duplicadas', async () => {
    const repository = { update: vi.fn().mockResolvedValue({ id: 'followup' }) };
    const useCase = new UpdateFollowupUseCase(repository as unknown as PastoralFollowupRepository);
    await useCase.execute(principal(['followups.manage']), 'followup', { nextActionAt: '2027-01-01T12:00:00-03:00', tagIds: ['tag', 'tag'] });
    expect(repository.update).toHaveBeenCalledWith(expect.any(Object), 'followup', { nextActionAt: '2027-01-01T15:00:00.000Z', tagIds: ['tag'] });
  });

  it('protege a criação de notas com permissão própria', async () => {
    const addNote = vi.fn();
    const useCase = new AddFollowupNoteUseCase({ addNote } as unknown as PastoralFollowupRepository);
    await expect(useCase.execute(principal(['followups.manage']), 'followup', { body: 'Nota interna', visibility: 'team' })).rejects.toThrow(AuthorizationError);
  });
});
