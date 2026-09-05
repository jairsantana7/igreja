import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from '../../application/ports/authentication.port';

export class BcryptPasswordHasher implements PasswordHasher {
  verify(plainText: string, passwordHash: string) {
    return compare(plainText, passwordHash);
  }

  hash(plainText: string) {
    return hash(plainText, 12);
  }
}
