export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env
): boolean {
  const horusEnv = env["HORUS_ENV"]?.trim().toLowerCase();
  if (horusEnv) return horusEnv === "production";
  return env["NODE_ENV"] === "production";
}
