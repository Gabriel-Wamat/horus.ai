import { createClient } from "redis";
import type {
  KeyValueCachePort,
  KeyValueCacheSetOptions,
} from "../../application/ports/index.js";

interface RedisClientLike {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { PX?: number | undefined }
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit?: () => Promise<unknown>;
  on(event: "error", listener: (err: unknown) => void): unknown;
}

export class RedisKeyValueCache implements KeyValueCachePort {
  private client: RedisClientLike | null = null;
  private connecting: Promise<RedisClientLike> | null = null;

  constructor(
    private readonly url: string,
    private readonly keyPrefix = "horus"
  ) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await (await this.getClient()).get(this.cacheKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson<T>(
    key: string,
    value: T,
    options?: KeyValueCacheSetOptions
  ): Promise<void> {
    const client = await this.getClient();
    const raw = JSON.stringify(value);
    if (options?.ttlMs && options.ttlMs > 0) {
      await client.set(this.cacheKey(key), raw, { PX: options.ttlMs });
      return;
    }
    await client.set(this.cacheKey(key), raw);
  }

  async delete(key: string): Promise<void> {
    await (await this.getClient()).del(this.cacheKey(key));
  }

  async close(): Promise<void> {
    if (!this.client?.isOpen) return;
    await this.client.quit?.();
    this.client = null;
  }

  private async getClient(): Promise<RedisClientLike> {
    if (this.client?.isOpen) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect();
    try {
      this.client = await this.connecting;
      return this.client;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<RedisClientLike> {
    const client = createClient({ url: this.url }) as unknown as RedisClientLike;
    client.on("error", () => {});
    await client.connect();
    return client;
  }

  private cacheKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }
}
