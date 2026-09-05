import { config as loadDotEnv } from 'dotenv';
import { resolve } from 'node:path';

loadDotEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`A variável ${name} é obrigatória.`);
  return value;
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`A variável ${name} deve ser um inteiro positivo.`);
  return value;
}

export const env = Object.freeze({
  appName: required('APP_NAME', 'Minha Comunidade'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPort: integer('API_PORT', 3101),
  corsOrigin: required('CORS_ORIGIN', 'http://localhost:3100'),
  databaseUrl: required('DATABASE_URL'),
  databaseAdminUrl: process.env.DATABASE_ADMIN_URL,
  migrationUrl: process.env.DATABASE_MIGRATION_URL,
  jwtSecret: required('JWT_SECRET'),
  jwtIssuer: required('JWT_ISSUER', 'igreja-api'),
  jwtAudience: required('JWT_AUDIENCE', 'igreja-web'),
  trustProxy: required('TRUST_PROXY', 'loopback,linklocal,uniquelocal'),
});

if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET precisa ter ao menos 32 caracteres.');
if (env.nodeEnv === 'production' && env.trustProxy.trim().toLowerCase() === 'true') {
  throw new Error('TRUST_PROXY=true é proibido em produção; informe redes confiáveis explícitas.');
}
