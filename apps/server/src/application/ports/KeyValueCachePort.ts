export interface KeyValueCacheSetOptions {
  ttlMs?: number;
}

export interface KeyValueCachePort {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(
    key: string,
    value: T,
    options?: KeyValueCacheSetOptions
  ): Promise<void>;
  delete(key: string): Promise<void>;
}
