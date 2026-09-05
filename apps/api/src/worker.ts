import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './infrastructure/config/env';
import { PostgresDatabase } from './infrastructure/database/postgres.database';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_DELIVERY_JOBS = new Set(['conversations.message.dispatch', 'events.communication.dispatch']);
const logger = new Logger('Worker');

function requiredUuid(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new UnrecoverableError(`Payload inválido: ${key}.`);
  return value;
}

async function markTerminalFailure(database: PostgresDatabase, job: Job): Promise<void> {
  if (!SUPPORTED_DELIVERY_JOBS.has(job.name) || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  const payload = job.data as Record<string, unknown>;
  const tenantId = requiredUuid(payload, 'tenantId');
  await database.withTenant(tenantId, async (client) => {
    if (job.name === 'conversations.message.dispatch') {
      await client.query(
        "UPDATE conversation_messages SET status = 'failed' WHERE id = $1 AND conversation_id = $2 AND status = 'queued'",
        [requiredUuid(payload, 'messageId'), requiredUuid(payload, 'conversationId')],
      );
      return;
    }
    await client.query(
      "UPDATE event_communications SET status = 'failed' WHERE id = $1 AND event_id = $2 AND status = 'queued'",
      [requiredUuid(payload, 'communicationId'), requiredUuid(payload, 'eventId')],
    );
  });
}

async function bootstrap(): Promise<void> {
  if (env.jobQueueDriver !== 'bullmq') throw new Error('O worker exige JOB_QUEUE_DRIVER=bullmq.');

  const database = new PostgresDatabase();
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', () => undefined);
  const worker = new Worker(env.jobQueueName, async (job) => {
    if (job.name === 'system.queue.probe') return { ready: true };
    if (SUPPORTED_DELIVERY_JOBS.has(job.name)) {
      throw new Error('Nenhum adaptador de entrega foi registrado para este job.');
    }
    throw new UnrecoverableError(`Tipo de job não suportado: ${job.name}.`);
  }, { connection, prefix: 'igreja', concurrency: env.workerConcurrency });

  worker.on('completed', (job) => logger.log({ event: 'job_completed', jobId: job.id, jobName: job.name }));
  worker.on('failed', (job, error) => {
    logger.warn({ event: 'job_failed', jobId: job?.id, jobName: job?.name, errorType: error.name });
    if (job) void markTerminalFailure(database, job).catch((failure) => logger.error({ event: 'job_failure_state_update_failed', errorType: failure instanceof Error ? failure.name : 'UnknownError' }));
  });
  worker.on('error', (error) => logger.error({ event: 'worker_error', errorType: error.name }));

  const shutdown = async () => {
    logger.log({ event: 'worker_stopping' });
    await worker.close();
    await connection.quit().catch(() => connection.disconnect());
    await database.onModuleDestroy();
  };
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  logger.log({ event: 'worker_ready', concurrency: env.workerConcurrency });
}

void bootstrap().catch((error) => {
  logger.error({ event: 'worker_boot_failed', errorType: error instanceof Error ? error.name : 'UnknownError' });
  process.exitCode = 1;
});
