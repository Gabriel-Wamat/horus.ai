import type {
  VectorStore,
  VectorStoreDocument,
  VectorStoreMatch,
  VectorStoreQuery,
} from "../../application/ports/index.js";

export class InMemoryVectorStore implements VectorStore {
  private readonly namespaces = new Map<string, Map<string, VectorStoreDocument>>();

  async upsert(input: {
    namespace?: string;
    documents: readonly VectorStoreDocument[];
    signal?: AbortSignal;
  }): Promise<void> {
    throwIfAborted(input.signal);
    const namespace = input.namespace ?? "default";
    const documents = this.namespaces.get(namespace) ?? new Map<string, VectorStoreDocument>();
    for (const document of input.documents) {
      throwIfAborted(input.signal);
      documents.set(document.id, document);
    }
    this.namespaces.set(namespace, documents);
  }

  async query(input: VectorStoreQuery): Promise<VectorStoreMatch[]> {
    throwIfAborted(input.signal);
    const documents = this.namespaces.get(input.namespace ?? "default") ?? new Map();
    return [...documents.values()]
      .filter((document) => metadataMatches(document.metadata, input.filter))
      .map((document) => ({
        id: document.id,
        score: cosineSimilarity(input.vector, document.vector),
        ...(document.text ? { text: document.text } : {}),
        ...(document.metadata ? { metadata: document.metadata } : {}),
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, input.topK);
  }

  async delete(input: {
    namespace?: string;
    ids: readonly string[];
    signal?: AbortSignal;
  }): Promise<void> {
    throwIfAborted(input.signal);
    const namespace = input.namespace ?? "default";
    const documents = this.namespaces.get(namespace);
    if (!documents) return;
    for (const id of input.ids) {
      documents.delete(id);
    }
  }
}

function metadataMatches(
  metadata: Record<string, unknown> | undefined,
  filter: Record<string, unknown> | undefined
): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => metadata?.[key] === value);
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Vector store operation cancelled.");
  error.name = "AbortError";
  throw error;
}
