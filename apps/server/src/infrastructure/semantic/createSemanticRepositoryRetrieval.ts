import { SemanticRepositoryIndexer } from "../../application/coding/SemanticRepositoryIndexer.js";
import { HybridRetrievalRanker } from "../../application/coding/HybridRetrievalRanker.js";
import { RepositoryChunker } from "../../application/coding/RepositoryChunker.js";
import type { SemanticRepositoryRetrievalPort } from "../../application/ports/index.js";
import { LocalHashEmbeddingProvider } from "../embeddings/LocalHashEmbeddingProvider.js";
import { InMemoryVectorStore } from "../vector/InMemoryVectorStore.js";

const SEMANTIC_EMBEDDING_DIMENSIONS_ENV = "HORUS_SEMANTIC_EMBEDDING_DIMENSIONS";
const SEMANTIC_EMBEDDING_MODEL_ENV = "HORUS_SEMANTIC_EMBEDDING_MODEL_ID";
const SEMANTIC_TOKEN_ALIASES_ENV = "HORUS_SEMANTIC_TOKEN_ALIASES_JSON";

export function createSemanticRepositoryRetrieval(
  env: Record<string, string | undefined>
): SemanticRepositoryRetrievalPort | undefined {
  const dimensionsValue = readEnv(env, SEMANTIC_EMBEDDING_DIMENSIONS_ENV);
  if (!dimensionsValue) return undefined;

  const dimensions = Number.parseInt(dimensionsValue, 10);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(
      `${SEMANTIC_EMBEDDING_DIMENSIONS_ENV} must be a positive integer when semantic retrieval is enabled.`
    );
  }

  const modelId = readEnv(env, SEMANTIC_EMBEDDING_MODEL_ENV);
  const tokenAliases = readTokenAliases(readEnv(env, SEMANTIC_TOKEN_ALIASES_ENV));
  const embeddingProvider = new LocalHashEmbeddingProvider({
    dimensions,
    ...(modelId ? { modelId } : {}),
    ...(tokenAliases ? { tokenAliases } : {}),
  });

  return new SemanticRepositoryIndexer(
    embeddingProvider,
    new InMemoryVectorStore(),
    new RepositoryChunker(),
    new HybridRetrievalRanker()
  );
}

function readEnv(
  env: Record<string, string | undefined>,
  name: string
): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readTokenAliases(
  raw: string | undefined
): ReadonlyMap<string, readonly string[]> | undefined {
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${SEMANTIC_TOKEN_ALIASES_ENV} must be a JSON object.`);
  }
  const entries: Array<readonly [string, readonly string[]]> = Object.entries(
    parsed
  ).map(([key, value]) => {
    if (typeof value === "string") return [key, [value]];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return [key, value];
    }
    throw new Error(
      `${SEMANTIC_TOKEN_ALIASES_ENV} values must be strings or string arrays.`
    );
  });
  return new Map(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
