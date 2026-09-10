import { DomainError } from '../entities/errors';

export class PhoneNumber {
  private constructor(readonly value: string) {}

  static create(input: string): PhoneNumber {
    const source = input.trim();
    const digits = source.replace(/\D/g, '');
    let normalized: string;

    if (source.startsWith('+')) normalized = `+${digits}`;
    else if (/^55\d{10,11}$/.test(digits)) normalized = `+${digits}`;
    else if (/^\d{10,11}$/.test(digits)) normalized = `+55${digits}`;
    else throw new DomainError('Informe um telefone com DDD válido.');

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new DomainError('Informe um telefone com DDD válido.');
    }
    return new PhoneNumber(normalized);
  }
}
