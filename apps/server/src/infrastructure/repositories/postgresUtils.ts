import { v4 as uuidv4 } from "uuid";
import { toPortableSlug } from "../workspace/portableSlug.js";

export function slugify(value: string, fallback = "item"): string {
  return toPortableSlug(value, { fallback });
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
