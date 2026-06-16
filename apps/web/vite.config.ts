import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const webDevHost = readEnv("HORUS_WEB_DEV_HOST", "127.0.0.1");
const webDevPort = readPort("HORUS_WEB_DEV_PORT", 5173);
const apiProxyTarget =
  process.env["HORUS_API_PROXY_TARGET"] ??
  `http://${readEnv("HORUS_API_PROXY_HOST", "127.0.0.1")}:${readPort(
    "HORUS_API_PROXY_PORT",
    3001
  )}`;

export default defineConfig({
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
});

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
