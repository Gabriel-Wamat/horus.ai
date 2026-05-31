import { createHash } from "node:crypto";
import type {
  EmbeddingBatchRequest,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingVector,
} from "../../application/ports/index.js";

export interface LocalHashEmbeddingProviderOptions {
  readonly dimensions: number;
  readonly modelId?: string;
  readonly tokenAliases?: ReadonlyMap<string, readonly string[]>;
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions: number;
  private readonly modelId: string | undefined;
  private readonly tokenAliases: ReadonlyMap<string, readonly string[]>;

  constructor(options: LocalHashEmbeddingProviderOptions) {
    if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) {
      throw new Error("LocalHashEmbeddingProvider requires a positive dimensions option.");
    }
    this.dimensions = options.dimensions;
    this.modelId = options.modelId;
    this.tokenAliases = options.tokenAliases ?? new Map();
  }

  async embedText(input: EmbeddingRequest): Promise<EmbeddingVector> {
    throwIfAborted(input.signal);
    return compactVector({
      values: embed(input.text, this.dimensions, this.tokenAliases),
      dimensions: this.dimensions,
      ...(this.modelId ? { model: this.modelId } : {}),
    });
  }

  async embedBatch(input: EmbeddingBatchRequest): Promise<EmbeddingVector[]> {
    throwIfAborted(input.signal);
    return input.inputs.map((item) => {
      throwIfAborted(input.signal ?? item.signal);
      return compactVector({
        values: embed(item.text, this.dimensions, this.tokenAliases),
        dimensions: this.dimensions,
        ...(this.modelId ? { model: this.modelId } : {}),
      });
    });
  }
}

function compactVector(input: {
  readonly values: readonly number[];
  readonly model?: string;
  readonly dimensions: number;
}): EmbeddingVector {
  return {
    values: input.values,
    ...(input.model ? { model: input.model } : {}),
    dimensions: input.dimensions,
  };
}

function embed(
  text: string,
  dimensions: number,
  aliases: ReadonlyMap<string, readonly string[]> = new Map()
): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of expandTokens(tokenize(text), aliases)) {
    addFeature(vector, token, 1);
    for (const trigram of trigrams(token)) {
      addFeature(vector, `tri:${trigram}`, 0.35);
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function expandTokens(
  tokens: readonly string[],
  aliases: ReadonlyMap<string, readonly string[]>
): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const alias of aliases.get(token) ?? []) {
      expanded.add(alias);
    }
  }
  return [...expanded];
}

function trigrams(token: string): string[] {
  if (token.length <= 3) return [token];
  const padded = ` ${token} `;
  const output: string[] = [];
  for (let index = 0; index <= padded.length - 3; index += 1) {
    output.push(padded.slice(index, index + 3));
  }
  return output;
}

function addFeature(vector: number[], feature: string, weight: number): void {
  const hash = createHash("sha256").update(feature).digest();
  const index = hash.readUInt32BE(0) % vector.length;
  const sign = hash.readUInt8(4) % 2 === 0 ? 1 : -1;
  vector[index] = (vector[index] ?? 0) + weight * sign;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Local embedding cancelled.");
  error.name = "AbortError";
  throw error;
}
