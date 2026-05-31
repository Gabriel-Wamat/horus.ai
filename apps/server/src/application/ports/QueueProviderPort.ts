export type QueueMessageStatus =
  | "available"
  | "leased"
  | "completed"
  | "dead_lettered";

export interface QueueEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  queueName: string;
  payload: TPayload;
  dedupeKey?: string;
  availableAt?: string;
  createdAt: string;
  attempts: number;
  status: QueueMessageStatus;
}

export interface QueueLease<TPayload = Record<string, unknown>>
  extends QueueEnvelope<TPayload> {
  leaseOwner: string;
  leaseExpiresAt: string;
}

export interface QueueProvider {
  enqueue<TPayload extends Record<string, unknown>>(input: {
    queueName: string;
    payload: TPayload;
    dedupeKey?: string;
    availableAt?: string;
    signal?: AbortSignal;
  }): Promise<QueueEnvelope<TPayload>>;

  lease<TPayload extends Record<string, unknown>>(input: {
    queueName: string;
    leaseOwner: string;
    leaseTtlMs: number;
    maxItems: number;
    signal?: AbortSignal;
  }): Promise<Array<QueueLease<TPayload>>>;

  ack(input: {
    queueName: string;
    messageId: string;
    leaseOwner: string;
    signal?: AbortSignal;
  }): Promise<void>;

  release(input: {
    queueName: string;
    messageId: string;
    leaseOwner: string;
    availableAt?: string;
    signal?: AbortSignal;
  }): Promise<void>;

  deadLetter(input: {
    queueName: string;
    messageId: string;
    leaseOwner: string;
    reason: string;
    signal?: AbortSignal;
  }): Promise<void>;
}
