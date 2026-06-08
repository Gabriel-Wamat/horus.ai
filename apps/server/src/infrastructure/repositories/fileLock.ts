import { dirname } from "node:path";
import { open, rm, stat, mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

interface FileLockOptions {
  readonly timeoutMs?: number;
  readonly retryDelayMs?: number;
  readonly staleMs?: number;
  readonly label?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAY_MS = 25;
const DEFAULT_STALE_MS = 60_000;

export async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>,
  options: FileLockOptions = {}
): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const lock = await acquireFileLock(path, options);
  try {
    return await operation();
  } finally {
    await lock.close();
    await rm(path, { force: true }).catch(() => undefined);
  }
}

async function acquireFileLock(
  path: string,
  options: FileLockOptions
): Promise<Awaited<ReturnType<typeof open>>> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const label = options.label ?? "file";

  for (;;) {
    try {
      return await open(path, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (await removeStaleLock(path, staleMs)) {
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for ${label} lock: ${path}`);
      }
      await delay(retryDelayMs);
    }
  }
}

async function removeStaleLock(path: string, staleMs: number): Promise<boolean> {
  try {
    const current = await stat(path);
    if (Date.now() - current.mtimeMs < staleMs) {
      return false;
    }
    await rm(path, { force: true });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return true;
    }
    throw err;
  }
}
