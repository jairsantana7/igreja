import { describe, expect, it, vi } from 'vitest';
import { MemberProfileDraft } from '../src/domain/entities/member-profile';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { MemberProfileRepository } from '../src/application/ports/member-profile.port';
import { GetMemberProfileUseCase, UpdateMemberProfileUseCase } from '../src/application/use-cases/member-profile.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});

describe('perfil complementar do membro', () => {
  it('mantém endereço e filhos opcionais e deriva a existência dos filhos no repositório', () => {
    const draft = MemberProfileDraft.create({ address: { city: ' São Paulo ', state: 'sp' }, children: [{ name: ' Ana ', birthDate: '2020-01-02' }] });
    expect(draft.props).toEqual({
      address: { postalCode: undefined, street: undefined, number: undefined, complement: undefined, neighborhood: undefined, city: 'São Paulo', state: 'SP' },
      children: [{ name: 'Ana', birthDate: '2020-01-02' }],
    });
  });

  it('rejeita nascimento futuro', () => {
    expect(() => MemberProfileDraft.create({ children: [{ name: 'Pessoa', birthDate: '2999-01-01' }] })).toThrow('data de nascimento');
    expect(() => MemberProfileDraft.create({ children: [{ name: 'Pessoa', birthDate: '2020-02-31' }] })).toThrow('data de nascimento');
  });

  it('separa permissões de perfil das permissões gerais de usuário', async () => {
    const find = vi.fn();
    const save = vi.fn();
    const get = new GetMemberProfileUseCase({ find } as unknown as MemberProfileRepository);
    const update = new UpdateMemberProfileUseCase({ save } as unknown as MemberProfileRepository);
    await expect(get.execute(principal(['users.read']), 'member')).rejects.toThrow(AuthorizationError);
    await expect(update.execute(principal(['users.update']), 'member', {})).rejects.toThrow(AuthorizationError);
    expect(find).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
