import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  ProjectFileContentQuerySchema,
  ProjectFileProjectParamsSchema,
  ProjectFileTreeQuerySchema,
  SaveProjectFileRequestSchema,
} from "@u-build/shared";
import {
  ProjectFileBrowserError,
  type ProjectFileBrowserService,
} from "../../project/ProjectFileBrowserService.js";
import type { ProjectArchiveService } from "../../project/ProjectArchiveService.js";

interface ProjectFileRouteDeps {
  fileBrowser: ProjectFileBrowserService;
  archiveService: ProjectArchiveService;
}

export function createProjectFileRouter(deps: ProjectFileRouteDeps): Router {
  const router = Router();

  router.get("/projects", async (_req: Request, res: Response) => {
    try {
      res.json({ projects: await deps.fileBrowser.listProjects() });
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  router.get("/projects/:projectId/tree", async (req: Request, res: Response) => {
    try {
      const params = ProjectFileProjectParamsSchema.parse(req.params);
      const query = ProjectFileTreeQuerySchema.parse(req.query);
      const input: Parameters<ProjectFileBrowserService["getTree"]>[0] = {
        projectId: params.projectId,
      };
      if (query.runId !== undefined) input.runId = query.runId;
      if (query.limit !== undefined) input.limit = query.limit;
      if (query.depth !== undefined) input.depth = query.depth;
      res.json(
        await deps.fileBrowser.getTree(input)
      );
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  router.get("/projects/:projectId/manifest", async (req: Request, res: Response) => {
    try {
      const params = ProjectFileProjectParamsSchema.parse(req.params);
      const query = ProjectFileTreeQuerySchema.pick({ runId: true }).parse(req.query);
      const input: Parameters<ProjectFileBrowserService["getManifest"]>[0] = {
        projectId: params.projectId,
      };
      if (query.runId !== undefined) input.runId = query.runId;
      res.json(await deps.fileBrowser.getManifest(input));
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  router.get("/projects/:projectId/download", async (req: Request, res: Response) => {
    try {
      const params = ProjectFileProjectParamsSchema.parse(req.params);
      const query = ProjectFileTreeQuerySchema.pick({ runId: true }).parse(req.query);
      const input: Parameters<ProjectArchiveService["createManifest"]>[0] = {
        projectId: params.projectId,
      };
      if (query.runId !== undefined) input.runId = query.runId;
      const manifest = await deps.archiveService.createManifest(input);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${manifest.fileName}"`
      );
      await deps.archiveService.streamZip(manifest, res);
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  router.get("/projects/:projectId/file", async (req: Request, res: Response) => {
    try {
      const params = ProjectFileProjectParamsSchema.parse(req.params);
      const query = ProjectFileContentQuerySchema.parse(req.query);
      const input: Parameters<ProjectFileBrowserService["getFileContent"]>[0] = {
        projectId: params.projectId,
        path: query.path,
      };
      if (query.runId !== undefined) input.runId = query.runId;
      if (query.maxBytes !== undefined) input.maxBytes = query.maxBytes;
      res.json(
        await deps.fileBrowser.getFileContent(input)
      );
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  router.put("/projects/:projectId/file", async (req: Request, res: Response) => {
    try {
      const params = ProjectFileProjectParamsSchema.parse(req.params);
      const body = SaveProjectFileRequestSchema.parse(req.body);
      const input: Parameters<ProjectFileBrowserService["saveFile"]>[0] = {
        projectId: params.projectId,
        path: body.path,
        content: body.content,
        baseVersion: body.baseVersion,
      };
      if (body.runId !== undefined && body.runId !== null) input.runId = body.runId;
      res.json(await deps.fileBrowser.saveFile(input));
    } catch (err) {
      handleProjectFileError(res, err);
    }
  });

  return router;
}

function handleProjectFileError(res: Response, err: unknown): void {
  if (res.headersSent) {
    res.destroy(err instanceof Error ? err : undefined);
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid project file request.",
      issues: err.issues,
    });
    return;
  }
  if (err instanceof ProjectFileBrowserError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...err.details,
    });
    return;
  }
  res.status(500).json({
    error: "internal_error",
    message: err instanceof Error ? err.message : String(err),
  });
}
