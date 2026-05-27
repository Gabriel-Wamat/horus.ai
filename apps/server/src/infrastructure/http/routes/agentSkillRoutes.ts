import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  AgentSkillListQuerySchema,
  CreateAgentSkillInputSchema,
  PublishAgentSkillInputSchema,
  UpdateAgentSkillBindingsInputSchema,
  ValidateAgentSkillInputSchema,
} from "@u-build/shared";
import {
  AgentSkillPublishRejectedError,
  AgentSkillRegistryError,
  AgentSkillRegistryService,
  AgentSkillStaleRevisionError,
} from "../../agentSkills/AgentSkillRegistryService.js";
import {
  AgentSkillNotFoundError,
  AgentSkillRevisionNotFoundError,
} from "../../repositories/FileAgentSkillRepository.js";
import { defaultAgentProfileRegistry } from "../../../application/services/AgentProfileRegistry.js";

interface AgentSkillRouteDeps {
  registry: AgentSkillRegistryService;
}

export function createAgentSkillRouter(deps: AgentSkillRouteDeps): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const filter = AgentSkillListQuerySchema.parse(req.query);
      res.json({ skills: await deps.registry.listSummaries(filter) });
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.get("/agent-profiles", (_req: Request, res: Response) => {
    res.json({ profiles: defaultAgentProfileRegistry.listProfiles() });
  });

  router.get(
    "/runtime/agents/:agentName",
    async (req: Request, res: Response) => {
      try {
        const skills = await deps.registry.resolveRuntimeSkillsForAgent(
          req.params["agentName"] ?? ""
        );
        res.json({ skills });
      } catch (err) {
        handleAgentSkillError(res, err);
      }
    }
  );

  router.post("/", async (req: Request, res: Response) => {
    try {
      const input = CreateAgentSkillInputSchema.parse(req.body);
      res.status(201).json(await deps.registry.createSkill(input));
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.post("/validate", async (req: Request, res: Response) => {
    try {
      const input = ValidateAgentSkillInputSchema.parse(req.body);
      res.json(await deps.registry.validateDraft(input));
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.get("/:skillId", async (req: Request, res: Response) => {
    try {
      res.json(await deps.registry.getDetail(req.params["skillId"] ?? ""));
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.post(
    "/:skillId/revisions/:revisionId/publish",
    async (req: Request, res: Response) => {
      try {
        const input = PublishAgentSkillInputSchema.parse(req.body);
        res.json(
          await deps.registry.publishRevision(
            req.params["skillId"] ?? "",
            req.params["revisionId"] ?? "",
            input
          )
        );
      } catch (err) {
        handleAgentSkillError(res, err);
      }
    }
  );

  router.put("/:skillId/bindings", async (req: Request, res: Response) => {
    try {
      const input = UpdateAgentSkillBindingsInputSchema.parse(req.body);
      res.json({
        bindings: await deps.registry.replaceBindings(
          req.params["skillId"] ?? "",
          input.bindings
        ),
      });
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.post("/:skillId/archive", async (req: Request, res: Response) => {
    try {
      res.json({ skill: await deps.registry.archiveSkill(req.params["skillId"] ?? "") });
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  return router;
}

function handleAgentSkillError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (
    err instanceof AgentSkillNotFoundError ||
    err instanceof AgentSkillRevisionNotFoundError
  ) {
    res.status(404).json({ error: "Not found", message: err.message });
    return;
  }
  if (err instanceof AgentSkillStaleRevisionError) {
    res.status(409).json({ error: "Stale revision", message: err.message });
    return;
  }
  if (
    err instanceof AgentSkillPublishRejectedError ||
    err instanceof AgentSkillRegistryError
  ) {
    res.status(422).json({ error: "Skill rejected", message: err.message });
    return;
  }
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}
