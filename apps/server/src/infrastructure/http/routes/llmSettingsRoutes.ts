import { Router, type Request, type Response } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { z, ZodError } from "zod";
import {
  LlmProvidersResponseSchema,
  LlmSettingsDraftSchema,
  LlmSettingsNullableProfileResponseSchema,
  LlmSettingsProfileResponseSchema,
  LlmSettingsReferenceSchema,
  LlmSettingsResolveResponseSchema,
  LlmSettingsTestResponseSchema,
  type LlmSettingsDraft,
  type LlmSettingsTestResponse,
} from "@u-build/shared";
import type { LlmCredentialStore } from "../../llm/LlmCredentialStore.js";
import {
  LlmProfileNotFoundError,
  LlmProfileSecretMissingError,
} from "../../llm/LlmCredentialStore.js";
import { LlmSettingsResolver } from "../../llm/LlmSettingsResolver.js";
import { createChatModel } from "../../llm/createChatModel.js";
import { invokeChatModel } from "../../llm/invokeChatModel.js";

interface LlmSettingsRouteDeps {
  credentials: LlmCredentialStore;
  resolver: LlmSettingsResolver;
}

const LlmSettingsSaveRequestSchema = LlmSettingsDraftSchema.extend({
  validationStatus: z.enum(["untested", "valid", "invalid"]).optional(),
  validationMessage: z.string().optional(),
  validatedAt: z.string().datetime().optional(),
});

export function createLlmSettingsRouter(deps: LlmSettingsRouteDeps): Router {
  const router = Router();

  router.get("/providers", (_req: Request, res: Response) => {
    res.json(
      parseLlmSettingsRouteResponse("GET /llm/providers", LlmProvidersResponseSchema, {
        providers: deps.credentials.listProviders(),
      })
    );
  });

  router.get("/settings", async (_req: Request, res: Response) => {
    try {
      const profile = await deps.credentials.getDefaultProfile();
      res.json(
        parseLlmSettingsRouteResponse(
          "GET /llm/settings",
          LlmSettingsNullableProfileResponseSchema,
          { profile }
        )
      );
    } catch (err) {
      handleLlmSettingsError(res, err);
    }
  });

  router.put("/settings", async (req: Request, res: Response) => {
    try {
      const draft = LlmSettingsSaveRequestSchema.parse(req.body);
      const profile = await deps.credentials.saveDefaultProfile({
        provider: draft.provider,
        model: draft.model,
        persistenceMode: draft.persistenceMode,
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
        ...(draft.baseUrl ? { baseUrl: draft.baseUrl } : {}),
        ...(draft.validationStatus
          ? { validationStatus: draft.validationStatus }
          : {}),
        ...(draft.validationMessage
          ? { validationMessage: draft.validationMessage }
          : {}),
        ...(draft.validatedAt ? { validatedAt: draft.validatedAt } : {}),
      });
      res.status(200).json(
        parseLlmSettingsRouteResponse(
          "PUT /llm/settings",
          LlmSettingsProfileResponseSchema,
          { profile }
        )
      );
    } catch (err) {
      handleLlmSettingsError(res, err);
    }
  });

  router.post("/settings/test", async (req: Request, res: Response) => {
    try {
      const draft = LlmSettingsDraftSchema.parse(req.body);
      const result = await testDraftSettings(draft);
      res.json(
        parseLlmSettingsRouteResponse(
          "POST /llm/settings/test",
          LlmSettingsTestResponseSchema,
          result
        )
      );
    } catch (err) {
      handleLlmSettingsError(res, err);
    }
  });

  router.delete("/settings/:profileId", async (req: Request, res: Response) => {
    try {
      await deps.credentials.deleteProfile(req.params["profileId"] ?? "");
      res.status(204).send();
    } catch (err) {
      handleLlmSettingsError(res, err);
    }
  });

  router.post("/settings/resolve", async (req: Request, res: Response) => {
    try {
      const reference = LlmSettingsReferenceSchema.parse(req.body);
      const settings = await deps.resolver.resolveReference(reference);
      res.json(
        parseLlmSettingsRouteResponse(
          "POST /llm/settings/resolve",
          LlmSettingsResolveResponseSchema,
          {
            resolved: Boolean(settings),
            provider: settings?.provider,
            model: settings?.model,
            baseUrl: settings?.baseUrl,
          }
        )
      );
    } catch (err) {
      handleLlmSettingsError(res, err);
    }
  });

  return router;
}

async function testDraftSettings(
  draft: LlmSettingsDraft
): Promise<LlmSettingsTestResponse> {
  if (!draft.apiKey) {
    return {
      ok: false,
      message: "Informe uma API key para testar a conexão.",
      testedAt: new Date().toISOString(),
    };
  }

  const startedAt = Date.now();
  try {
    const model = createChatModel(
      "horus",
      { temperature: 0, maxTokens: 16 },
      {
        provider: draft.provider,
        model: draft.model,
        apiKey: draft.apiKey,
        ...(draft.baseUrl ? { baseUrl: draft.baseUrl } : {}),
      }
    );
    await withTimeout(
      invokeChatModel(model, [new HumanMessage("Reply with exactly: ok")]),
      20_000
    );
    return {
      ok: true,
      message: `Conexão validada em ${Date.now() - startedAt}ms.`,
      testedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      message: redactSecretMessage(
        err instanceof Error ? err.message : "Falha ao testar provider LLM."
      ),
      testedAt: new Date().toISOString(),
    };
  }
}

interface LlmSettingsRouteContract<T> {
  parse(input: unknown): T;
}

class LlmSettingsRouteResponseContractError extends Error {
  constructor(route: string, cause: unknown) {
    super(`LLM settings route response contract violated at ${route}`, { cause });
    this.name = "LlmSettingsRouteResponseContractError";
  }
}

function parseLlmSettingsRouteResponse<T>(
  route: string,
  contract: LlmSettingsRouteContract<T>,
  payload: unknown
): T {
  try {
    return contract.parse(payload);
  } catch (err) {
    throw new LlmSettingsRouteResponseContractError(route, err);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Teste de conexão excedeu ${timeoutMs / 1000}s.`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function handleLlmSettingsError(res: Response, err: unknown): void {
  if (err instanceof LlmSettingsRouteResponseContractError) {
    res.status(500).json({ error: "Internal server error", message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (
    err instanceof LlmProfileNotFoundError ||
    err instanceof LlmProfileSecretMissingError
  ) {
    res.status(404).json({
      error: err.name,
      message: redactSecretMessage(err.message),
    });
    return;
  }
  res.status(500).json({
    error: "Internal server error",
    message: redactSecretMessage(err instanceof Error ? err.message : String(err)),
  });
}

function redactSecretMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/gu, "sk-***")
    .replace(/gsk_[A-Za-z0-9_-]+/gu, "gsk_***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer ***");
}
