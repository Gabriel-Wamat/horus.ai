import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  AgentProfilesResponseSchema,
  AgentSkillBindingsResponseSchema,
  AgentSkillDetailSchema,
  AgentSkillListQuerySchema,
  AgentSkillSummaryResponseSchema,
  AgentSkillsListResponseSchema,
  CreateAgentSkillInputSchema,
  CreateAgentSkillResponseSchema,
  PublishAgentSkillInputSchema,
  PublishAgentSkillResponseSchema,
  RuntimeAgentSkillsResponseSchema,
  UpdateAgentSkillBindingsInputSchema,
  ValidateAgentSkillResponseSchema,
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
      res.json(
        parseAgentSkillRouteResponse("GET /agent-skills", AgentSkillsListResponseSchema, {
          skills: await deps.registry.listSummaries(filter),
        })
      );
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.get("/agent-profiles", (_req: Request, res: Response) => {
    res.json(
      parseAgentSkillRouteResponse(
        "GET /agent-skills/agent-profiles",
        AgentProfilesResponseSchema,
        { profiles: defaultAgentProfileRegistry.listProfiles() }
      )
    );
  });

  router.get(
    "/runtime/agents/:agentName",
    async (req: Request, res: Response) => {
      try {
        const skills = await deps.registry.resolveRuntimeSkillsForAgent(
          req.params["agentName"] ?? ""
        );
        res.json(
          parseAgentSkillRouteResponse(
            "GET /agent-skills/runtime/agents/:agentName",
            RuntimeAgentSkillsResponseSchema,
            { skills }
          )
        );
      } catch (err) {
        handleAgentSkillError(res, err);
      }
    }
  );

  router.post("/", async (req: Request, res: Response) => {
    try {
      const input = CreateAgentSkillInputSchema.parse(req.body);
      res.status(201).json(
        parseAgentSkillRouteResponse(
          "POST /agent-skills",
          CreateAgentSkillResponseSchema,
          await deps.registry.createSkill(input)
        )
      );
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.post("/validate", async (req: Request, res: Response) => {
    try {
      const input = ValidateAgentSkillInputSchema.parse(req.body);
      res.json(
        parseAgentSkillRouteResponse(
          "POST /agent-skills/validate",
          ValidateAgentSkillResponseSchema,
          await deps.registry.validateDraft(input)
        )
      );
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.get("/:skillId", async (req: Request, res: Response) => {
    try {
      res.json(
        parseAgentSkillRouteResponse(
          "GET /agent-skills/:skillId",
          AgentSkillDetailSchema,
          await deps.registry.getDetail(req.params["skillId"] ?? "")
        )
      );
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
          parseAgentSkillRouteResponse(
            "POST /agent-skills/:skillId/revisions/:revisionId/publish",
            PublishAgentSkillResponseSchema,
            await deps.registry.publishRevision(
              req.params["skillId"] ?? "",
              req.params["revisionId"] ?? "",
              input
            )
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
      res.json(
        parseAgentSkillRouteResponse(
          "PUT /agent-skills/:skillId/bindings",
          AgentSkillBindingsResponseSchema,
          {
            bindings: await deps.registry.replaceBindings(
              req.params["skillId"] ?? "",
              input.bindings
            ),
          }
        )
      );
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  router.post("/:skillId/archive", async (req: Request, res: Response) => {
    try {
      res.json(
        parseAgentSkillRouteResponse(
          "POST /agent-skills/:skillId/archive",
          AgentSkillSummaryResponseSchema,
          { skill: await deps.registry.archiveSkill(req.params["skillId"] ?? "") }
        )
      );
    } catch (err) {
      handleAgentSkillError(res, err);
    }
  });

  return router;
}

interface AgentSkillRouteContract<T> {
  parse(input: unknown): T;
}

class AgentSkillRouteResponseContractError extends Error {
  constructor(route: string, cause: unknown) {
    super(`Agent skill route response contract violated at ${route}`, { cause });
    this.name = "AgentSkillRouteResponseContractError";
  }
}

function parseAgentSkillRouteResponse<T>(
  route: string,
  contract: AgentSkillRouteContract<T>,
  payload: unknown
): T {
  try {
    return contract.parse(payload);
  } catch (err) {
    throw new AgentSkillRouteResponseContractError(route, err);
  }
}

function handleAgentSkillError(res: Response, err: unknown): void {
  if (err instanceof AgentSkillRouteResponseContractError) {
    res.status(500).json({ error: "Internal server error", message: err.message });
    return;
  }
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
