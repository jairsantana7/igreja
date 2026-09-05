import { describe, expect, it, vi } from 'vitest';
import { BullMqJobQueue } from '../src/infrastructure/queue/bullmq-job.queue';

describe('adapter BullMQ', () => {
  it('traduz atraso, tentativas e deduplicação sem expor BullMQ à aplicação', async () => {
    const client = { add: vi.fn().mockResolvedValue({ id: 'job-42' }), close: vi.fn() };
    const queue = BullMqJobQueue.fromClient(client);

    await expect(queue.enqueue({
      name: 'conversations.message.dispatch',
      payload: { tenantId: 'tenant', messageId: 'message' },
      deduplicationKey: 'message',
    }, { attempts: 5, delayMs: 2_500 })).resolves.toEqual({ jobId: 'job-42' });

    expect(client.add).toHaveBeenCalledWith('conversations.message.dispatch', expect.any(Object), expect.objectContaining({
      attempts: 5,
      delay: 2_500,
      deduplication: { id: 'message' },
      backoff: { type: 'exponential', delay: 1_000 },
    }));
  });

  it('mantém retenção limitada e normaliza atrasos negativos', async () => {
    const client = { add: vi.fn().mockResolvedValue({ id: 7 }), close: vi.fn() };
    const queue = BullMqJobQueue.fromClient(client);
    await queue.enqueue({ name: 'system.probe', payload: {} }, { delayMs: -10 });
    expect(client.add).toHaveBeenCalledWith('system.probe', {}, expect.objectContaining({
      delay: 0,
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 50_000 },
    }));
  });
});
