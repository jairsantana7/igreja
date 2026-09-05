import type { SecretResolver } from '../../application/ports/secret-resolver.port';

export class EnvironmentSecretResolver implements SecretResolver {
  resolve(reference: string): string {
    if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(reference)) throw new Error('Referência de segredo inválida.');
    const value = process.env[reference];
    if (!value) throw new Error('Segredo não configurado nesta instalação.');
    return value;
  }
}
