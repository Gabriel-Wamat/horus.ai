export interface EmbeddingRequest {
  text: string;
  purpose?: "memory" | "rag" | "search" | "classification";
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface EmbeddingBatchRequest {
  inputs: readonly EmbeddingRequest[];
  signal?: AbortSignal;
}

export interface EmbeddingVector {
  values: readonly number[];
  model?: string;
  dimensions?: number;
}

export interface EmbeddingProvider {
  embedText(input: EmbeddingRequest): Promise<EmbeddingVector>;
  embedBatch(input: EmbeddingBatchRequest): Promise<EmbeddingVector[]>;
}
