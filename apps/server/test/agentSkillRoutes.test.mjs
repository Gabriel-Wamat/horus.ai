import assert from "node:assert/strict";
import express from "express";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileAgentSkillRepository } from "../dist/infrastructure/repositories/FileAgentSkillRepository.js";
import { AgentSkillValidationService } from "../dist/infrastructure/agentSkills/AgentSkillValidationService.js";
import { AgentSkillRegistryService } from "../dist/infrastructure/agentSkills/AgentSkillRegistryService.js";
import { createAgentSkillRouter } from "../dist/infrastructure/http/routes/agentSkillRoutes.js";

test("agent skill routes create, publish, bind, and resolve runtime skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-skill-routes-"));
  const app = express();
  app.use(express.json());
  const registry = new AgentSkillRegistryService(
    new FileAgentSkillRepository(join(root, "data")),
    new AgentSkillValidationService(),
    { repositoryRoot: root, skillsRoot: join(root, "missing-skills") }
  );
  app.use("/api/agent-skills", createAgentSkillRouter({ registry }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/agent-skills`;

  try {
    const createResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Front Polish",
        description: "Improves generated frontend polish.",
        skillMd:
          "---\nname: front-polish\ndescription: Front polish\n---\n# Front Polish",
        bindings: [
          {
            agentProfileId: "front_agent",
            triggerMode: "automatic",
            priority: 20,
            enabled: true,
          },
        ],
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.validationReport.status, "passed");

    const publishResponse = await fetch(
      `${baseUrl}/${created.skill.id}/revisions/${created.draftRevision.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevisionHash: created.draftRevision.contentHash,
        }),
      }
    );
    assert.equal(publishResponse.status, 200);

    const runtimeResponse = await fetch(`${baseUrl}/runtime/agents/front`);
    assert.equal(runtimeResponse.status, 200);
    const runtime = await runtimeResponse.json();
    assert.equal(runtime.skills.length, 1);
    assert.equal(runtime.skills[0].slug, "front-polish");

    const profilesResponse = await fetch(`${baseUrl}/agent-profiles`);
    assert.equal(profilesResponse.status, 200);
    const profiles = await profilesResponse.json();
    assert.ok(
      profiles.profiles.some((profile) => profile.id === "front_agent")
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
