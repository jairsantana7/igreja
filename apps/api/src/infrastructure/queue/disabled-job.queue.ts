import type { EnqueueOptions, JobMessage, JobQueue } from '../../application/ports/job-queue.port';

export class DisabledJobQueue implements JobQueue {
  async enqueue<TPayload extends Record<string, unknown>>(
    _message: JobMessage<TPayload>,
    _options?: EnqueueOptions,
  ): Promise<{ jobId: string }> {
    throw new Error('Nenhum adaptador de fila foi configurado para esta implantação.');
  }
}
