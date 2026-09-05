import type { OnModuleDestroy } from '@nestjs/common';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import type { EnqueueOptions, JobMessage, JobQueue } from '../../application/ports/job-queue.port';

interface QueueClient {
  add(name: string, payload: Record<string, unknown>, options: JobsOptions): Promise<Pick<Job, 'id'>>;
  close(): Promise<void>;
}

export class BullMqJobQueue implements JobQueue, OnModuleDestroy {
  private constructor(private readonly queue: QueueClient, private readonly connection?: IORedis) {}

  static connect(redisUrl: string, queueName: string): BullMqJobQueue {
    const connection = new IORedis(redisUrl, {
      connectTimeout: 3_000,
      commandTimeout: 5_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    connection.on('error', () => undefined);
    return new BullMqJobQueue(new Queue(queueName, { connection, prefix: 'igreja' }), connection);
  }

  static fromClient(client: QueueClient): BullMqJobQueue {
    return new BullMqJobQueue(client);
  }

  async enqueue<TPayload extends Record<string, unknown>>(
    message: JobMessage<TPayload>,
    options: EnqueueOptions = {},
  ): Promise<{ jobId: string }> {
    const job = await this.queue.add(message.name, message.payload, {
      attempts: options.attempts ?? 3,
      backoff: { type: 'exponential', delay: 1_000 },
      delay: Math.max(0, options.delayMs ?? 0),
      deduplication: message.deduplicationKey ? { id: message.deduplicationKey } : undefined,
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 50_000 },
    });
    if (job.id === undefined) throw new Error('O broker não retornou o identificador do job.');
    return { jobId: String(job.id) };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    if (this.connection) await this.connection.quit().catch(() => this.connection?.disconnect());
  }
}
