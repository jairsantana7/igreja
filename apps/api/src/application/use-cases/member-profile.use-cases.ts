import { MemberProfileDraft } from '../../domain/entities/member-profile';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberProfileRepository } from '../ports/member-profile.port';
import { AuthorizationError, NotFoundError } from './errors';

export class GetMemberProfileUseCase {
  constructor(private readonly profiles: MemberProfileRepository) {}
  async execute(principal: AuthenticatedPrincipal, memberId: string) {
    if (!principal.permissions.includes(PERMISSIONS.memberProfilesRead)) throw new AuthorizationError('Você não tem permissão para visualizar perfis complementares.');
    const profile = await this.profiles.find(principal, memberId);
    if (!profile) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    return profile;
  }
}

export class UpdateMemberProfileUseCase {
  constructor(private readonly profiles: MemberProfileRepository) {}
  async execute(principal: AuthenticatedPrincipal, memberId: string, input: Parameters<typeof MemberProfileDraft.create>[0]) {
    if (!principal.permissions.includes(PERMISSIONS.memberProfilesManage)) throw new AuthorizationError('Você não tem permissão para editar perfis complementares.');
    const profile = await this.profiles.save(principal, memberId, MemberProfileDraft.create(input));
    if (!profile) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    return profile;
  }
}
