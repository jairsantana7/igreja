import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import {
  ConnectConversationChannelJobUseCase,
  DisconnectConversationChannelJobUseCase,
  DispatchConversationMessageJobUseCase,
} from './application/use-cases/conversation-runtime.use-cases';
import { env } from './infrastructure/config/env';
import { PostgresDatabase } from './infrastructure/database/postgres.database';
import { BaileysConversationProvider } from './infrastructure/integrations/baileys/baileys-conversation.provider';
import { StaticConversationProviderResolver } from './infrastructure/integrations/static-conversation-provider.resolver';
import { NestApplicationLogger } from './infrastructure/observability/nest-application.logger';
import { PostgresConversationProviderStateStore } from './infrastructure/repositories/postgres-conversation-provider-state.store';
import { PostgresConversationRuntimeRepository } from './infrastructure/repositories/postgres-conversation-runtime.repository';
import { AesGcmStateCipher } from './infrastructure/security/aes-gcm-state.cipher';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const logger = new Logger('WhatsAppWorker');

function requiredUuid(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new UnrecoverableError(`Payload inválido: ${key}.`);
  return value;
}

async function bootstrap(): Promise<void> {
  if (env.jobQueueDriver !== 'bullmq' || env.whatsappWebDriver !== 'baileys') {
    throw new Error('O worker exige JOB_QUEUE_DRIVER=bullmq e WHATSAPP_WEB_DRIVER=baileys.');
  }

  const database = new PostgresDatabase();
  const runtime = new PostgresConversationRuntimeRepository(database);
  const states = new PostgresConversationProviderStateStore(database, new AesGcmStateCipher(env.conversationSessionEncryptionKey));
  const provider = new BaileysConversationProvider(states, runtime, new NestApplicationLogger());
  const providers = new StaticConversationProviderResolver([provider]);
  const connectChannel = new ConnectConversationChannelJobUseCase(runtime, providers);
  const disconnectChannel = new DisconnectConversationChannelJobUseCase(runtime, providers);
  const dispatchMessage = new DispatchConversationMessageJobUseCase(runtime, providers);
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', () => undefined);

  const worker = new Worker(env.whatsappQueueName, async (job: Job) => {
    const payload = job.data as Record<string, unknown>;
    const tenantId = requiredUuid(payload, 'tenantId');
    if (job.name === 'conversations.channel.connect') {
      await connectChannel.execute(tenantId, requiredUuid(payload, 'channelId'));
      return;
    }
    if (job.name === 'conversations.channel.disconnect') {
      await disconnectChannel.execute(tenantId, requiredUuid(payload, 'channelId'));
      return;
    }
    if (job.name === 'conversations.message.dispatch') {
      await dispatchMessage.execute(tenantId, requiredUuid(payload, 'conversationId'), requiredUuid(payload, 'messageId'));
      return;
    }
    throw new UnrecoverableError(`Tipo de job não suportado: ${job.name}.`);
  }, { connection, prefix: 'igreja', concurrency: env.workerConcurrency });

  worker.on('completed', (job) => logger.log({ event: 'whatsapp_job_completed', jobId: job.id, jobName: job.name }));
  worker.on('failed', (job, error) => {
    logger.warn({ event: 'whatsapp_job_failed', jobId: job?.id, jobName: job?.name, errorType: error.name });
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    void (async () => {
      const payload = job.data as Record<string, unknown>;
      const tenantId = requiredUuid(payload, 'tenantId');
      if (job.name === 'conversations.message.dispatch') {
        await runtime.markOutboundFailed(tenantId, requiredUuid(payload, 'conversationId'), requiredUuid(payload, 'messageId'));
      } else if (job.name === 'conversations.channel.connect' || job.name === 'conversations.channel.disconnect') {
        await runtime.updateConnection(tenantId, requiredUuid(payload, 'channelId'), { status: 'failed', failureCode: 'worker_job_failed' });
      }
    })().catch((stateError) => {
      logger.error({ event: 'whatsapp_failure_state_update_failed', errorType: stateError instanceof Error ? stateError.name : 'UnknownError' });
    });
  });
  worker.on('error', (error) => logger.error({ event: 'whatsapp_worker_error', errorType: error.name }));

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    logger.log({ event: 'whatsapp_worker_stopping' });
    await worker.close();
    await provider.shutdown();
    await connection.quit().catch(() => connection.disconnect());
    await database.onModuleDestroy();
  };
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  logger.log({ event: 'whatsapp_worker_ready', concurrency: env.workerConcurrency, queue: env.whatsappQueueName });
}

void bootstrap().catch((error) => {
  logger.error({ event: 'whatsapp_worker_boot_failed', errorType: error instanceof Error ? error.name : 'UnknownError' });
  process.exitCode = 1;
});
