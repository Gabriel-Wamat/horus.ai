import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { HorusChatTurnInputSchema } from "@u-build/shared";
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
    try {
      const input = HorusChatTurnInputSchema.parse(req.body);
      const result = await deps.submitChatTurnUseCase.execute(input);
      res.status(201).json(result);
    } catch (err) {
      handleHorusChatRouteError(err, res);
    }
  });

  return router;
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
  res.status(500).json({ error: "Internal server error" });
}
