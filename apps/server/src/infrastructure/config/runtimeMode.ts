export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env["NODE_ENV"] === "production" || env["HORUS_ENV"] === "production";
}
