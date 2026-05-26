import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { CreateWorkspaceFolderInputSchema, SpecSchema, UserStorySchema } from "@u-build/shared";
import {
  WorkspaceFolderNotFoundError,
  WorkspaceSpecNotFoundError,
  WorkspaceUserStoryNotFoundError,
  type FileWorkspaceStore,
} from "../../workspace/FileWorkspaceStore.js";

interface WorkspaceRouteDeps {
  workspaceStore: FileWorkspaceStore;
}

export function createWorkspaceRouter(deps: WorkspaceRouteDeps): Router {
  const router = Router();

  router.get("/folders", async (_req: Request, res: Response) => {
    try {
      const folders = await deps.workspaceStore.listFolders();
      res.json({ folders });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/folders", async (req: Request, res: Response) => {
    try {
      const input = CreateWorkspaceFolderInputSchema.parse(req.body);
      const folder = await deps.workspaceStore.createFolder(input.name);
      res.status(201).json({ folder });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/folders/:folderId/user-stories", async (req: Request, res: Response) => {
    try {
      const artifacts = await deps.workspaceStore.listUserStoryArtifacts(
        req.params["folderId"] ?? ""
      );
      const userStories = artifacts.map((artifact) => artifact.story);
      res.json({ userStories, artifacts });
    } catch (err) {
      if (err instanceof WorkspaceFolderNotFoundError) {
        res.status(404).json({ error: "Workspace folder not found", message: err.message });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/folders/:folderId/artifacts", async (req: Request, res: Response) => {
    try {
      const artifacts = await deps.workspaceStore.listUserStoryArtifacts(
        req.params["folderId"] ?? ""
      );
      res.json({ artifacts });
    } catch (err) {
      if (err instanceof WorkspaceFolderNotFoundError) {
        res.status(404).json({ error: "Workspace folder not found", message: err.message });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/folders/:folderId/user-stories/:storyId", async (req: Request, res: Response) => {
    try {
      const userStory = UserStorySchema.parse(req.body);
      const updated = await deps.workspaceStore.updateUserStory(
        req.params["folderId"] ?? "",
        req.params["storyId"] ?? "",
        userStory
      );
      res.json({ userStory: updated });
    } catch (err) {
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/folders/:folderId/user-stories/:storyId/specs/:specId", async (req: Request, res: Response) => {
    try {
      const spec = SpecSchema.parse(req.body);
      const updated = await deps.workspaceStore.updateSpec(
        req.params["folderId"] ?? "",
        req.params["storyId"] ?? "",
        req.params["specId"] ?? "",
        spec
      );
      res.json({ spec: updated });
    } catch (err) {
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
      if (err instanceof WorkspaceSpecNotFoundError) {
        res.status(404).json({ error: "Workspace spec not found", message: err.message });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/folders/:folderId/user-stories/:storyId", async (req: Request, res: Response) => {
    try {
      await deps.workspaceStore.deleteUserStory(
        req.params["folderId"] ?? "",
        req.params["storyId"] ?? ""
      );
      res.status(204).send();
    } catch (err) {
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
  });

  return router;
}
