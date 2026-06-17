import assert from "node:assert/strict";
import test from "node:test";
import {
  createSecurityBoundaryMiddleware,
  resolveSecurityBoundaryPolicy,
} from "../dist/infrastructure/http/securityBoundary.js";

function runMiddleware(policy, headers = {}) {
  const req = {
    header(name) {
      return headers[name.toLowerCase()] ?? headers[name] ?? undefined;
    },
  };
  const response = {
    statusCode: 200,
    payload: null,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalls = 0;
  const middleware = createSecurityBoundaryMiddleware(policy);
  middleware(req, response, () => {
    nextCalls += 1;
  });
  return { response, nextCalls };
}

test("production security boundary fails fast without token and tenant", () => {
  assert.throws(
    () =>
      resolveSecurityBoundaryPolicy({
        HORUS_ENV: "production",
        HORUS_TENANT_ID: "tenant-a",
      }),
    /HORUS_API_TOKEN/
  );

  assert.throws(
    () =>
      resolveSecurityBoundaryPolicy({
        HORUS_ENV: "production",
        HORUS_API_TOKEN: "secret-token",
      }),
    /HORUS_TENANT_ID/
  );
});

test("token auth mode fails fast without an api token", () => {
  assert.throws(
    () =>
      resolveSecurityBoundaryPolicy({
        HORUS_AUTH_MODE: "token",
      }),
    /HORUS_API_TOKEN/
  );
});

test("security middleware enforces bearer token and tenant header", () => {
  const policy = resolveSecurityBoundaryPolicy({
    HORUS_ENV: "production",
    HORUS_API_TOKEN: "secret-token",
    HORUS_TENANT_ID: "tenant-a",
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.required, true);
  assert.equal(policy.tenantId, "tenant-a");

  const missingToken = runMiddleware(policy, {
    "x-horus-tenant-id": "tenant-a",
  });
  assert.equal(missingToken.response.statusCode, 401);
  assert.deepEqual(missingToken.response.payload, { error: "unauthorized" });
  assert.equal(missingToken.nextCalls, 0);

  const wrongTenant = runMiddleware(policy, {
    authorization: "Bearer secret-token",
    "x-horus-tenant-id": "tenant-b",
  });
  assert.equal(wrongTenant.response.statusCode, 403);
  assert.deepEqual(wrongTenant.response.payload, { error: "tenant_forbidden" });
  assert.equal(wrongTenant.nextCalls, 0);

  const accepted = runMiddleware(policy, {
    authorization: "Bearer secret-token",
    "x-horus-tenant-id": "tenant-a",
  });
  assert.equal(accepted.response.statusCode, 200);
  assert.equal(accepted.nextCalls, 1);
  assert.deepEqual(accepted.response.locals.horusSecurityContext, {
    role: "member",
    tenantId: "tenant-a",
  });
});
