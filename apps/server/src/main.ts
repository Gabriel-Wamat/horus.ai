import "dotenv/config";
import { loadRuntimeConfig } from "./infrastructure/config/runtimeConfig.js";
import { createApp } from "./infrastructure/http/server.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"]?.trim();
const runtimeConfig = loadRuntimeConfig(process.env);

const app = await createApp();

const onListen = () => {
  const displayHost = HOST && HOST.length > 0 ? HOST : "0.0.0.0";
  console.log(`[U-Build Server] Listening on ${displayHost}:${PORT}`);
  console.log(
    `[U-Build Server] Persistence driver=${runtimeConfig.persistenceDriver} dataDir=${runtimeConfig.paths.dataDir} repositoryRoot=${runtimeConfig.repositoryRoot}`
  );
};

if (HOST && HOST.length > 0) {
  app.listen(PORT, HOST, onListen);
} else {
  app.listen(PORT, onListen);
}
