export interface VectorStoreDocument {
  id: string;
  vector: readonly number[];
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorStoreQuery {
  vector: readonly number[];
  namespace?: string;
  topK: number;
  filter?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface VectorStoreMatch {
  id: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  upsert(input: {
    namespace?: string;
    documents: readonly VectorStoreDocument[];
    signal?: AbortSignal;
  }): Promise<void>;

  query(input: VectorStoreQuery): Promise<VectorStoreMatch[]>;

  delete(input: {
    namespace?: string;
    ids: readonly string[];
    signal?: AbortSignal;
  }): Promise<void>;
}
