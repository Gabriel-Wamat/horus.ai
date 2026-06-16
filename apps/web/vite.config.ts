import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // vite.config.ts runs before Vite's own .env loading is applied to
  // process.env, so apps/web/.env values must be loaded explicitly here.
  const env = { ...process.env, ...loadEnv(mode, __dirname, "") };
  const webDevHost = readEnv(env, "HORUS_WEB_DEV_HOST", "0.0.0.0");
  const webDevPort = readPort(env, "HORUS_WEB_DEV_PORT", 5173);
  const apiProxyTarget =
    env["HORUS_API_PROXY_TARGET"] ??
    `http://${readEnv(env, "HORUS_API_PROXY_HOST", readEnv(env, "HORUS_PUBLIC_HOST", hostname()))}:${readPort(
      env,
      "HORUS_API_PROXY_PORT",
      3001
    )}`;

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/monaco-editor") || id.includes("@monaco-editor")) {
              return "vendor-monaco";
            }
            if (id.includes("node_modules/@xyflow")) return "vendor-flow";
            if (id.includes("node_modules/@tanstack")) return "vendor-query";
            if (id.includes("node_modules")) return "vendor";
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        "@u-build/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    },
    server: {
      host: webDevHost,
      port: webDevPort,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

function readEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string
): string {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readPort(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
