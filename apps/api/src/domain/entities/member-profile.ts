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
  private constructor(readonly props: {
    phone?: string; birthDate?: string; spouseName?: string; marriageDate?: string;
    address: MemberAddress; children: MemberChildDraft[];
  }) {}

  static create(input: {
    phone?: string; birthDate?: string; spouseName?: string; marriageDate?: string;
    address?: MemberAddress; children?: MemberChildDraft[];
  }) {
    const clean = (value: string | undefined, max: number) => {
      const normalized = value?.trim() || undefined;
      if (normalized && normalized.length > max) throw new DomainError(`Um campo do endereço excede ${max} caracteres.`);
      return normalized;
    };
    const phone = clean(input.phone, 32);
    if (phone && phone.length < 8) throw new DomainError('O telefone deve ter entre 8 e 32 caracteres.');
    const birthDate = this.validateBirthDate(input.birthDate, 'A data de nascimento do membro é inválida.');
    const spouseName = clean(input.spouseName, 120);
    if (spouseName && spouseName.length < 2) throw new DomainError('O nome do cônjuge deve ter entre 2 e 120 caracteres.');
    const marriageDate = this.validateBirthDate(input.marriageDate, 'A data de casamento é inválida.');
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
      return { name, birthDate: this.validateBirthDate(child.birthDate, 'A data de nascimento do filho é inválida.') };
    });
    if (children.length > 50) throw new DomainError('O perfil aceita no máximo 50 filhos cadastrados.');
    return new MemberProfileDraft({ phone, birthDate, spouseName, marriageDate, address, children });
  }

  get isEmpty() {
    return !this.props.phone
      && !this.props.birthDate
      && !this.props.spouseName
      && !this.props.marriageDate
      && Object.values(this.props.address).every((value) => !value)
      && this.props.children.length === 0;
  }

  private static validateBirthDate(value: string | undefined, message: string) {
    if (!value) return undefined;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed > new Date()) {
      throw new DomainError(message);
    }
    return value;
  }
}
