import { isProductionRuntime } from "../config/runtimeMode.js";

export function readCorsOrigin(
  env: Record<string, string | undefined>
): boolean | string[] {
  const raw = env["CORS_ORIGIN"]?.trim();
  if (isProductionRuntime(env)) {
    if (!raw || raw === "*") {
      throw new Error(
        "CORS_ORIGIN must be set to explicit origins in production."
      );
    }
    const origins = parseOrigins(raw);
    if (origins.length === 0) {
      throw new Error("CORS_ORIGIN must include at least one origin.");
    }
    return origins;
  }

  if (!raw || raw === "*") return true;
  return parseOrigins(raw);
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
