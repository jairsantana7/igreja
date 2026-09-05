import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';

export interface MemberOnboardingRepository {
  create(principal: AuthenticatedPrincipal, input: {
    name: string;
    email: string;
    passwordHash: string;
    roleIds: string[];
    profile?: MemberProfileDraft;
  }): Promise<{ id: string; name: string; email: string }>;
}
