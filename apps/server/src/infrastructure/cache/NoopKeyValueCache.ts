import type {
  KeyValueCachePort,
  KeyValueCacheSetOptions,
} from "../../application/ports/index.js";

export class NoopKeyValueCache implements KeyValueCachePort {
  async getJson<T>(_key: string): Promise<T | null> {
    return null;
  }

  async setJson<T>(
    _key: string,
    _value: T,
    _options?: KeyValueCacheSetOptions
  ): Promise<void> {}

  async delete(_key: string): Promise<void> {}
}
