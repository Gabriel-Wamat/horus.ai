import type { NextFunction, Request, RequestHandler, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { isProductionRuntime } from "../config/runtimeMode.js";

export type HorusSecurityRole = "member";

export interface HorusSecurityContext {
  role: HorusSecurityRole;
  tenantId: string | null;
}

export interface SecurityBoundaryPolicy {
  enabled: boolean;
  required: boolean;
  tenantId: string | null;
  memberToken: string | null;
}

export function resolveSecurityBoundaryPolicy(
  env: Record<string, string | undefined>
): SecurityBoundaryPolicy {
  const production = isProductionRuntime(env);
  const authMode = env["HORUS_AUTH_MODE"]?.trim().toLowerCase();
  const memberToken = readSecret(env, "HORUS_API_TOKEN");
  const tenantId = readSecret(env, "HORUS_TENANT_ID");
  const enabled = production || authMode === "token" || Boolean(memberToken);

  if (authMode === "token" && !memberToken) {
    throw new Error("HORUS_AUTH_MODE=token requires HORUS_API_TOKEN.");
  }
  if (production && !memberToken) {
    throw new Error("HORUS_API_TOKEN must be set in production.");
  }
  if (production && !tenantId) {
    throw new Error("HORUS_TENANT_ID must be set in production.");
  }

  return {
    enabled,
    required: production || authMode === "token",
    tenantId,
    memberToken,
  };
}

export function createSecurityBoundaryMiddleware(
  policy: SecurityBoundaryPolicy
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!policy.enabled) {
      next();
      return;
    }

    const token = readBearerToken(req);
    const role = resolveRole(token, policy);
    if (!role) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (policy.tenantId) {
      const tenantHeader = req.header("x-horus-tenant-id")?.trim();
      if (tenantHeader !== policy.tenantId) {
        res.status(403).json({ error: "tenant_forbidden" });
        return;
      }
    }

    res.locals["horusSecurityContext"] = {
      role,
      tenantId: policy.tenantId,
    } satisfies HorusSecurityContext;
    next();
  };
}

function readSecret(
  env: Record<string, string | undefined>,
  name: string
): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function readBearerToken(req: Request): string | null {
  const value = req.header("authorization")?.trim();
  if (!value) return null;
  const separatorIndex = value.indexOf(" ");
  if (separatorIndex <= 0) return null;
  const scheme = value.slice(0, separatorIndex);
  const token = value.slice(separatorIndex + 1).trim();
  if (scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function resolveRole(
  token: string | null,
  policy: SecurityBoundaryPolicy
): HorusSecurityRole | null {
  if (!token) return null;
  if (policy.memberToken && secretsEqual(token, policy.memberToken)) return "member";
  return null;
}

function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
