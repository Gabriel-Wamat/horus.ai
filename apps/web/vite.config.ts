import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiProxyTarget = env["HORUS_API_PROXY_TARGET"] ?? process.env["HORUS_API_PROXY_TARGET"] ?? "http://localhost:3000";

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
      port: 5173,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
