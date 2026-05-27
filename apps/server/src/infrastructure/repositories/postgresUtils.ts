import { v4 as uuidv4 } from "uuid";

export function slugify(value: string, fallback = "item"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug || fallback;
}

export function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function json<T>(value: T): string {
  return JSON.stringify(value);
}

export function newId(): string {
  return uuidv4();
}
