import assert from "node:assert/strict";
import test from "node:test";
import { scanContent } from "./secret-scan.mjs";

test("secret scanner catches high-confidence provider keys", () => {
  const findings = scanContent(
    `OPENAI_API_KEY=${"sk-" + "1234567890abcdefghijklmnopqrstuv"}\n`,
    "sample.env"
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "openai_api_key");
});

test("secret scanner supports explicit allow comments for fixtures", () => {
  const findings = scanContent(
    `fixture='${"sk-" + "1234567890abcdefghijklmnopqrstuv"}' # secret-scan: allow\n`,
    "sample.test.ts"
  );

  assert.equal(findings.length, 0);
});
