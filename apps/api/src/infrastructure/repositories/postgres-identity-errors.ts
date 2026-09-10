import { ConflictError } from '../../application/use-cases/errors';

export function identityUniqueConflict(error: unknown, emailMessage?: string): ConflictError | null {
  const postgresError = error as { code?: string; constraint?: string };
  if (postgresError.code !== '23505') return null;
  if (postgresError.constraint === 'member_profiles_tenant_phone_normalized_key') {
    return new ConflictError('Este WhatsApp já está vinculado a outra conta da comunidade.');
  }
  return emailMessage ? new ConflictError(emailMessage) : null;
}

export async function withIdentityUniqueConflict<T>(work: Promise<T>, emailMessage?: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const conflict = identityUniqueConflict(error, emailMessage);
    if (conflict) throw conflict;
    throw error;
  }
}
