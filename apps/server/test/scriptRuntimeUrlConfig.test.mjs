import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBaseUrl,
  resolveHttpBaseUrl,
} from "../../../scripts/runtime-url-config.mjs";

test("script runtime URL config prefers explicit base URL", () => {
  assert.equal(
    resolveHttpBaseUrl(
      { HORUS_DOCKER_BASE_URL: "https://preview.example.test:9443/base/" },
      {
        label: "Docker smoke",
        baseUrlEnv: "HORUS_DOCKER_BASE_URL",
        hostEnv: ["HORUS_DOCKER_HOST", "HORUS_PUBLIC_HOST"],
        portEnv: ["HORUS_WEB_HOST_PORT"],
      }
    ),
    "https://preview.example.test:9443/base"
  );
});

test("script runtime URL config requires host when base URL is absent", () => {
  assert.throws(
    () =>
      resolveHttpBaseUrl(
        {},
        {
          label: "Preview smoke",
          baseUrlEnv: "HORUS_BASE_URL",
          hostEnv: ["HORUS_PREVIEW_SMOKE_HOST", "HORUS_PUBLIC_HOST"],
          portEnv: ["HORUS_PREVIEW_SMOKE_PORT"],
        }
      ),
    /requires HORUS_BASE_URL/
  );
});

test("script runtime URL config builds URLs from public host and optional port", () => {
  assert.equal(
    resolveHttpBaseUrl(
      { HORUS_PUBLIC_HOST: "preview.team.example", HORUS_WEB_HOST_PORT: "8080" },
      {
        label: "Docker smoke",
        baseUrlEnv: "HORUS_DOCKER_BASE_URL",
        hostEnv: ["HORUS_DOCKER_HOST", "HORUS_PUBLIC_HOST"],
        portEnv: ["HORUS_WEB_HOST_PORT"],
      }
    ),
    "http://preview.team.example:8080"
  );
});

test("script runtime URL config normalizes paths without changing host", () => {
  assert.equal(normalizeBaseUrl("http://preview.team.example:8080/app///"), "http://preview.team.example:8080/app");
});
