import { DomainError } from './errors';

export interface MemberAddress {
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface MemberChildDraft {
  name: string;
  birthDate?: string;
}

export class MemberProfileDraft {
  private constructor(readonly props: { address: MemberAddress; children: MemberChildDraft[] }) {}

  static create(input: { address?: MemberAddress; children?: MemberChildDraft[] }) {
    const clean = (value: string | undefined, max: number) => {
      const normalized = value?.trim() || undefined;
      if (normalized && normalized.length > max) throw new DomainError(`Um campo do endereço excede ${max} caracteres.`);
      return normalized;
    };
    const address: MemberAddress = {
      postalCode: clean(input.address?.postalCode, 16),
      street: clean(input.address?.street, 160),
      number: clean(input.address?.number, 32),
      complement: clean(input.address?.complement, 120),
      neighborhood: clean(input.address?.neighborhood, 120),
      city: clean(input.address?.city, 120),
      state: clean(input.address?.state, 2)?.toUpperCase(),
    };
    if (address.state && !/^[A-Z]{2}$/.test(address.state)) throw new DomainError('O estado deve usar uma sigla com duas letras.');
    const children = (input.children ?? []).map((child) => {
      const name = child.name.trim();
      if (name.length < 2 || name.length > 120) throw new DomainError('O nome do filho deve ter entre 2 e 120 caracteres.');
      if (child.birthDate) {
        const birthDate = new Date(`${child.birthDate}T00:00:00.000Z`);
        if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== child.birthDate || birthDate > new Date()) {
          throw new DomainError('A data de nascimento do filho é inválida.');
        }
      }
      return { name, birthDate: child.birthDate || undefined };
    });
    if (children.length > 50) throw new DomainError('O perfil aceita no máximo 50 filhos cadastrados.');
    return new MemberProfileDraft({ address, children });
  }
}
