import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { HorusChatStreamEventSchema, HorusChatTurnInputSchema } from "@u-build/shared";
import {
  HorusChatContextMismatchError,
  type SubmitHorusChatTurnUseCase,
} from "../../../application/usecases/SubmitHorusChatTurnUseCase.js";
import { ChatSessionNotFoundError } from "../../chat/FileChatMemoryStore.js";
import { PreviewSessionNotFoundError } from "../../preview/FilePreviewSessionStore.js";
import {
  WorkspaceFolderNotFoundError,
  WorkspaceUserStoryNotFoundError,
} from "../../workspace/FileWorkspaceStore.js";

interface HorusChatRouteDeps {
  submitChatTurnUseCase: SubmitHorusChatTurnUseCase;
}

export function createHorusChatRouter(deps: HorusChatRouteDeps): Router {
  const router = Router();

  router.post("/chat/turn", async (req: Request, res: Response) => {
    const abortController = createRequestAbortController(req, res);
    try {
      const input = HorusChatTurnInputSchema.parse(req.body);
      const result = await deps.submitChatTurnUseCase.execute(input, {
        signal: abortController.signal,
      });
      res.status(201).json(result);
    } catch (err) {
      handleHorusChatRouteError(err, res);
    } finally {
      abortController.cleanup();
    }
  });

  router.post("/chat/turn/stream", async (req: Request, res: Response) => {
    const abortController = createRequestAbortController(req, res);
    try {
      const input = HorusChatTurnInputSchema.parse(req.body);
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(": Horus chat stream opened\n\n");

      for await (const event of deps.submitChatTurnUseCase.stream(input, {
        signal: abortController.signal,
      })) {
        if (res.writableEnded) break;
        const parsed = HorusChatStreamEventSchema.parse(event);
        res.write(`id: ${parsed.sequence}\n`);
        res.write(`event: ${parsed.type}\n`);
        res.write(`data: ${JSON.stringify(parsed)}\n\n`);
      }
      res.end();
    } catch (err) {
      if (res.headersSent) {
        const event = HorusChatStreamEventSchema.parse({
          type: "turn_failed",
          sequence: 1,
          errorCode: "horus_chat_stream_failed",
          message: err instanceof Error ? err.message : "Falha ao processar mensagem.",
          retryable: false,
        });
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.end();
        return;
      }
      handleHorusChatRouteError(err, res);
    } finally {
      abortController.cleanup();
    }
  });

  return router;
}

function createRequestAbortController(
  req: Request,
  res: Response
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) {
      controller.abort(new Error("client_disconnected"));
    }
  };
  req.on("aborted", abort);
  res.on("close", abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      req.off("aborted", abort);
      res.off("close", abort);
    },
  };
}

function handleHorusChatRouteError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof HorusChatContextMismatchError) {
    res.status(409).json({ error: "Horus chat context mismatch", message: err.message });
    return;
  }
  if (err instanceof ChatSessionNotFoundError) {
    res.status(404).json({ error: "Chat session not found", message: err.message });
    return;
  }
  if (err instanceof PreviewSessionNotFoundError) {
    res.status(404).json({ error: "Preview session not found", message: err.message });
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
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}
