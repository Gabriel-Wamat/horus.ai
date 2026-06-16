export function readEnvValue(env, name) {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function readFirstEnvValue(env, names) {
  for (const name of names) {
    const value = readEnvValue(env, name);
    if (value) return value;
  }
  return undefined;
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = trimTrailingSlash(url.pathname);
  url.search = "";
  url.hash = "";
  return url.toString().endsWith("/")
    ? url.toString().slice(0, -1)
    : url.toString();
}

export function resolveHttpBaseUrl(env, options) {
  const explicitBaseUrl = readEnvValue(env, options.baseUrlEnv);
  if (explicitBaseUrl) return normalizeBaseUrl(explicitBaseUrl);

  const host = readFirstEnvValue(env, options.hostEnv);
  if (!host) {
    throw new Error(
      `${options.label} requires ${options.baseUrlEnv} or one of ${options.hostEnv.join(", ")}.`
    );
  }

  const port =
    readFirstEnvValue(env, options.portEnv) ?? options.defaultPort;
  const authority = port ? `${host}:${port}` : host;
  return normalizeBaseUrl(`http://${authority}`);
}

function trimTrailingSlash(value) {
  if (value === "/") return "";
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}
