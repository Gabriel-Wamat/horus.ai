import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface JsonSchema<T> {
  parse(value: unknown): T;
}

export async function readJsonFile<T>(
  path: string,
  schema: JsonSchema<T>,
  options?: { defaultValue?: undefined }
): Promise<T>;
export async function readJsonFile<T, D>(
  path: string,
  schema: JsonSchema<T>,
  options: { defaultValue: D }
): Promise<T | D>;
export async function readJsonFile<T, D>(
  path: string,
  schema: JsonSchema<T>,
  options?: { defaultValue?: D }
): Promise<T | D> {
  try {
    const raw = await fs.readFile(path, "utf-8");
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" &&
      Object.prototype.hasOwnProperty.call(options ?? {}, "defaultValue")
    ) {
      return options!.defaultValue as T;
    }
    throw err;
  }
}

export async function readJsonFileRaw(
  path: string,
  options?: { defaultValue?: unknown }
): Promise<unknown> {
  try {
    const raw = await fs.readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" &&
      Object.prototype.hasOwnProperty.call(options ?? {}, "defaultValue")
    ) {
      return options!.defaultValue;
    }
    throw err;
  }
}

// Windows can transiently deny a rename onto an existing file (EPERM/EBUSY)
// while antivirus/indexing briefly holds a handle on it, and concurrent
// writers targeting the same path can race on the same rename. Both are
// resolved below: writes to a given path are serialized, and the rename
// itself is retried a few times before giving up.
const pendingWritesByPath = new Map<string, Promise<void>>();
const RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200, 400];

export async function writeJsonFileAtomic(
  path: string,
  value: unknown,
  options?: { trailingNewline?: boolean }
): Promise<void> {
  const previous = pendingWritesByPath.get(path) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeJsonFileAtomicNow(path, value, options));
  pendingWritesByPath.set(path, next);
  try {
    await next;
  } finally {
    if (pendingWritesByPath.get(path) === next) {
      pendingWritesByPath.delete(path);
    }
  }
}

async function writeJsonFileAtomicNow(
  path: string,
  value: unknown,
  options?: { trailingNewline?: boolean }
): Promise<void> {
  const directory = dirname(path);
  await fs.mkdir(directory, { recursive: true });

  const tempPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
  );
  const trailingNewline = options?.trailingNewline ?? false;
  const payload = `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`;

  try {
    await fs.writeFile(tempPath, payload, "utf-8");
    await renameWithRetry(tempPath, path);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw err;
  }
}

async function renameWithRetry(tempPath: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tempPath, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const isTransientLock = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!isTransientLock || attempt >= RENAME_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]));
    }
  }
}
