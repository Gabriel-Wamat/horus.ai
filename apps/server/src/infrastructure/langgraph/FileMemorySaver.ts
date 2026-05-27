import { MemorySaver } from "@langchain/langgraph";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

interface MemorySaverSnapshot {
  storage: unknown;
  writes: unknown;
}

interface MemorySaverInternals {
  storage: unknown;
  writes: unknown;
}

interface EncodedBytes {
  __horusEncodedBytes: string;
}

function encodeForJson(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return {
      __horusEncodedBytes: Buffer.from(value).toString("base64"),
    } satisfies EncodedBytes;
  }
  if (Array.isArray(value)) return value.map((item) => encodeForJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeForJson(item)])
    );
  }
  return value;
}

function decodeFromJson(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "__horusEncodedBytes" in value &&
    typeof (value as EncodedBytes).__horusEncodedBytes === "string"
  ) {
    return Buffer.from((value as EncodedBytes).__horusEncodedBytes, "base64");
  }
  if (Array.isArray(value)) return value.map((item) => decodeFromJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeFromJson(item)])
    );
  }
  return value;
}

export class FileMemorySaver extends MemorySaver {
  private constructor(private readonly path: string) {
    super();
  }

  static async create(path: string): Promise<FileMemorySaver> {
    const saver = new FileMemorySaver(path);
    const snapshot = (await readJsonFileRaw(path, {
      defaultValue: null,
    })) as MemorySaverSnapshot | null;

    if (snapshot && typeof snapshot === "object") {
      const internals = saver as unknown as MemorySaverInternals;
      internals.storage = decodeFromJson(snapshot.storage ?? {});
      internals.writes = decodeFromJson(snapshot.writes ?? {});
    }

    return saver;
  }

  override async put(
    ...args: Parameters<MemorySaver["put"]>
  ): ReturnType<MemorySaver["put"]> {
    const result = await super.put(...args);
    await this.persist();
    return result;
  }

  override async putWrites(
    ...args: Parameters<MemorySaver["putWrites"]>
  ): ReturnType<MemorySaver["putWrites"]> {
    const result = await super.putWrites(...args);
    await this.persist();
    return result;
  }

  override async deleteThread(
    ...args: Parameters<MemorySaver["deleteThread"]>
  ): ReturnType<MemorySaver["deleteThread"]> {
    const result = await super.deleteThread(...args);
    await this.persist();
    return result;
  }

  private async persist(): Promise<void> {
    const internals = this as unknown as MemorySaverInternals;
    await writeJsonFileAtomic(
      this.path,
      {
        storage: encodeForJson(internals.storage ?? {}),
        writes: encodeForJson(internals.writes ?? {}),
      },
      { trailingNewline: true }
    );
  }
}
