export interface JobMessage<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  payload: TPayload;
  deduplicationKey?: string;
}

export interface EnqueueOptions {
  delayMs?: number;
  attempts?: number;
}

export interface JobQueue {
  enqueue<TPayload extends Record<string, unknown>>(
    message: JobMessage<TPayload>,
    options?: EnqueueOptions,
  ): Promise<{ jobId: string }>;
}
