import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppendChatMessageInputSchema,
  CreateChatSessionInputSchema,
} from "@u-build/shared";
import {
  ChatSessionNotFoundError,
  type FileChatMemoryStore,
} from "../../chat/FileChatMemoryStore.js";
import {
  WorkspaceFolderNotFoundError,
  WorkspaceUserStoryNotFoundError,
} from "../../workspace/FileWorkspaceStore.js";

interface ChatRouteDeps {
  chatMemoryStore: FileChatMemoryStore;
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
      res.json({ sessions });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/sessions", async (req: Request, res: Response) => {
    try {
      const input = CreateChatSessionInputSchema.parse(req.body);
      const session = await deps.chatMemoryStore.createSession(input);
      res.status(201).json({ session });
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const messages = await deps.chatMemoryStore.listMessages(
        req.params["sessionId"] ?? ""
      );
      res.json({ messages });
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
      res.status(201).json({ message });
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/context", async (req: Request, res: Response) => {
    try {
      const context = await deps.chatMemoryStore.buildAgentContext(
        req.params["sessionId"] ?? ""
      );
      res.json({ context });
    } catch (err) {
      handleChatRouteError(err, res);
    }
  });

  return router;
}

function handleChatRouteError(err: unknown, res: Response): void {
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
  res.status(500).json({ error: "Internal server error" });
}
