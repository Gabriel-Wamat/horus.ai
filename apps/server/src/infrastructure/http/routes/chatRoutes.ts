import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppendChatMessageInputSchema,
  ChatContextResponseSchema,
  ChatMessageResponseSchema,
  ChatMessagesResponseSchema,
  ChatSessionResponseSchema,
  ChatSessionsResponseSchema,
  CreateChatSessionInputSchema,
} from "@u-build/shared";
import {
  ChatSessionNotFoundError,
} from "../../chat/FileChatMemoryStore.js";
import type { ChatMemoryRepository } from "../../repositories/contracts.js";
import {
  WorkspaceFolderNotFoundError,
  WorkspaceUserStoryNotFoundError,
} from "../../workspace/FileWorkspaceStore.js";

interface ChatRouteDeps {
  chatMemoryStore: ChatMemoryRepository;
}

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.get("/sessions", async (req: Request, res: Response) => {
    try {
      const sessions = await deps.chatMemoryStore.listSessions({
        ...(typeof req.query["workspaceFolderId"] === "string"
          ? { workspaceFolderId: req.query["workspaceFolderId"] }
          : {}),
        ...(typeof req.query["userStoryId"] === "string"
          ? { userStoryId: req.query["userStoryId"] }
          : {}),
      });
      res.json(
        parseChatRouteResponse("GET /chat/sessions", ChatSessionsResponseSchema, {
          sessions,
        })
      );
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.post("/sessions", async (req: Request, res: Response) => {
    try {
      const input = CreateChatSessionInputSchema.parse(req.body);
      const session = await deps.chatMemoryStore.createSession(input);
      res.status(201).json(
        parseChatRouteResponse("POST /chat/sessions", ChatSessionResponseSchema, {
          session,
        })
      );
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const rawAfterSequence = Number(req.query["after_sequence"] ?? NaN);
      const messages = await deps.chatMemoryStore.listMessages(
        req.params["sessionId"] ?? "",
        Number.isFinite(rawAfterSequence) && rawAfterSequence >= 0
          ? { afterSequence: rawAfterSequence }
          : undefined
      );
      res.json(
        parseChatRouteResponse(
          "GET /chat/sessions/:sessionId/messages",
          ChatMessagesResponseSchema,
          { messages }
        )
      );
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const input = AppendChatMessageInputSchema.parse(req.body);
      const message = await deps.chatMemoryStore.appendMessage(
        req.params["sessionId"] ?? "",
        input
      );
      res.status(201).json(
        parseChatRouteResponse(
          "POST /chat/sessions/:sessionId/messages",
          ChatMessageResponseSchema,
          { message }
        )
      );
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/context", async (req: Request, res: Response) => {
    try {
      const context = await deps.chatMemoryStore.buildAgentContext(
        req.params["sessionId"] ?? ""
      );
      res.json(
        parseChatRouteResponse(
          "GET /chat/sessions/:sessionId/context",
          ChatContextResponseSchema,
          { context }
        )
      );
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  return router;
}

interface ChatRouteContract<T> {
  parse(input: unknown): T;
}

class ChatRouteResponseContractError extends Error {
  constructor(route: string, cause: unknown) {
    super(`Chat route response contract violated at ${route}`, { cause });
    this.name = "ChatRouteResponseContractError";
  }
}

function parseChatRouteResponse<T>(
  route: string,
  contract: ChatRouteContract<T>,
  payload: unknown
): T {
  try {
    return contract.parse(payload);
  } catch (err) {
    throw new ChatRouteResponseContractError(route, err);
  }
}

function handleChatRouteError(err: unknown, res: Response): void {
  if (err instanceof ChatRouteResponseContractError) {
    res.status(500).json({ error: "Internal server error", message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof WorkspaceFolderNotFoundError) {
    res.status(404).json({ error: "Workspace folder not found", message: err.message });
    return;
  }
  if (err instanceof WorkspaceUserStoryNotFoundError) {
    res.status(404).json({ error: "Workspace user story not found", message: err.message });
    return;
  }
  if (err instanceof ChatSessionNotFoundError) {
    res.status(404).json({ error: "Chat session not found", message: err.message });
    return;
  }
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}
