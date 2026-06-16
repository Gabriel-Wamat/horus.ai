import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { ProcessBrowserPreviewAdapter } from "../dist/infrastructure/preview/ProcessBrowserPreviewAdapter.js";

const loopbackHost = ["127", "0", "0", "1"].join(".");

test("preview readiness accepts only successful HTTP responses", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ready");
      return;
    }
    if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
      return;
    }
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("broken");
  });

  await new Promise((resolve) => server.listen(0, loopbackHost, resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const baseUrl = `http://${loopbackHost}:${address.port}`;
  const adapter = new ProcessBrowserPreviewAdapter({ fetchTimeoutMs: 500 });

  try {
    assert.equal(await adapter.isReachable(`${baseUrl}/ok`), true);
    assert.equal(await adapter.isReachable(`${baseUrl}/missing`), false);
    assert.equal(await adapter.isReachable(`${baseUrl}/broken`), false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
