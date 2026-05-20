import "dotenv/config";
import { createApp } from "./infrastructure/http/server.js";

const PORT = Number(process.env["PORT"] ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`[U-Build Server] Listening on http://localhost:${PORT}`);
});
