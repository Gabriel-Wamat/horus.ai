import "dotenv/config";
import { createApp } from "./infrastructure/http/server.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"]?.trim();

const app = await createApp();

const onListen = () => {
  const displayHost = HOST && HOST.length > 0 ? HOST : "0.0.0.0";
  console.log(`[U-Build Server] Listening on ${displayHost}:${PORT}`);
};

if (HOST && HOST.length > 0) {
  app.listen(PORT, HOST, onListen);
} else {
  app.listen(PORT, onListen);
}
