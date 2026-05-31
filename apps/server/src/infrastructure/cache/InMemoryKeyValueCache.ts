import type {
  KeyValueCachePort,
  KeyValueCacheSetOptions,
} from "../../application/ports/index.js";

interface CacheEntry {
  value: string;
  expiresAt: number | null;
}

export class InMemoryKeyValueCache implements KeyValueCachePort {
  private readonly entries = new Map<string, CacheEntry>();

  async getJson<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async setJson<T>(
    key: string,
    value: T,
    options?: KeyValueCacheSetOptions
  ): Promise<void> {
    const ttlMs = options?.ttlMs;
    this.entries.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
