import type { JobMessage, JobQueue, EnqueueOptions } from '../../application/ports/job-queue.port';

type CloseableJobQueue = JobQueue & { onModuleDestroy?: () => Promise<void> };

export class RoutedJobQueue implements JobQueue {
  constructor(private readonly fallback: CloseableJobQueue, private readonly conversations: CloseableJobQueue) {}

  enqueue<TPayload extends Record<string, unknown>>(message: JobMessage<TPayload>, options?: EnqueueOptions): Promise<{ jobId: string }> {
    const queue = message.name.startsWith('conversations.') ? this.conversations : this.fallback;
    return queue.enqueue(message, options);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.fallback.onModuleDestroy?.(),
      this.conversations.onModuleDestroy?.(),
    ]);
  }
}
