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

export async function writeJsonFileAtomic(
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
    try {
      await fs.rename(tempPath, path);
    } catch (renameErr) {
      // Windows: rename over an existing file can fail with EPERM when the
      // destination is held open; fall back to copy-then-unlink.
      if ((renameErr as NodeJS.ErrnoException).code === "EPERM") {
        await fs.copyFile(tempPath, path);
        await fs.unlink(tempPath).catch(() => undefined);
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw err;
  }
}
