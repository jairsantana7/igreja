import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';

export interface MemberProfileView {
  member: { id: string; name: string; email: string };
  phone: string | null;
  birthDate: string | null;
  spouseName: string | null;
  marriageDate: string | null;
  address: {
    postalCode: string | null; street: string | null; number: string | null; complement: string | null;
    neighborhood: string | null; city: string | null; state: string | null;
  };
  hasChildren: boolean;
  children: Array<{ id: string; name: string; birthDate: string | null }>;
  updatedAt: string | null;
}

export interface MemberProfileRepository {
  find(principal: AuthenticatedPrincipal, memberId: string): Promise<MemberProfileView | null>;
  save(principal: AuthenticatedPrincipal, memberId: string, draft: MemberProfileDraft): Promise<MemberProfileView | null>;
}
