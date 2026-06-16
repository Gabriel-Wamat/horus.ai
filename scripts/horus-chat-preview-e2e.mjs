import { randomUUID } from "node:crypto";
import { resolveHttpBaseUrl } from "./runtime-url-config.mjs";

const required = {
  HORUS_E2E_CHAT_SESSION_ID: process.env.HORUS_E2E_CHAT_SESSION_ID,
  HORUS_E2E_WORKSPACE_FOLDER_ID: process.env.HORUS_E2E_WORKSPACE_FOLDER_ID,
  HORUS_E2E_USER_STORY_ID: process.env.HORUS_E2E_USER_STORY_ID,
  HORUS_E2E_PROJECT_ID: process.env.HORUS_E2E_PROJECT_ID,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.log(
    `SKIP horus-chat-preview-e2e: missing ${missing.join(", ")}.`
  );
  process.exit(0);
}

const baseUrl = resolveHttpBaseUrl(process.env, {
  label: "Horus chat preview E2E",
  baseUrlEnv: "HORUS_E2E_BASE_URL",
  hostEnv: ["HORUS_E2E_HOST", "HORUS_PUBLIC_HOST"],
  portEnv: ["HORUS_E2E_PORT", "HORUS_API_PROXY_PORT", "PORT"],
});

const payload = {
  chatSessionId: required.HORUS_E2E_CHAT_SESSION_ID,
  workspaceFolderId: required.HORUS_E2E_WORKSPACE_FOLDER_ID,
  userStoryId: required.HORUS_E2E_USER_STORY_ID,
  projectId: required.HORUS_E2E_PROJECT_ID,
  previewSessionId: process.env.HORUS_E2E_PREVIEW_SESSION_ID,
  workflowThreadId: process.env.HORUS_E2E_WORKFLOW_THREAD_ID,
  idempotencyKey: process.env.HORUS_E2E_IDEMPOTENCY_KEY ?? `e2e-${randomUUID()}`,
  message:
    process.env.HORUS_E2E_MESSAGE ??
    "Troque o texto do botão Home para Início e valide o preview.",
};

const chatResponse = await postJson(`${baseUrl}/api/horus/chat/turn`, payload);
if (!chatResponse.assistantMessage && !chatResponse.outcome) {
  fail("Chat turn did not return assistantMessage or outcome.", chatResponse);
}

const status = chatResponse.outcome?.status;
if (status && !["completed", "accepted", "running", "blocked"].includes(status)) {
  fail(`Chat turn returned failing status ${status}.`, chatResponse);
}

if (payload.previewSessionId) {
  const previewResponse = await getJson(
    `${baseUrl}/api/preview/sessions/${payload.previewSessionId}`
  );
  if (!previewResponse.session) {
    fail("Preview session lookup did not return a session.", previewResponse);
  }
}

console.log(
  `PASS horus-chat-preview-e2e: outcome=${status ?? "unknown"} action=${
    chatResponse.outcome?.action ?? "unknown"
  }.`
);

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readCheckedJson(response, url);
}

async function getJson(url) {
  const response = await fetch(url);
  return readCheckedJson(response, url);
}

async function readCheckedJson(response, url) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail(`Endpoint ${url} did not return JSON.`, { status: response.status, text });
  }
  if (!response.ok) {
    fail(`Endpoint ${url} returned HTTP ${response.status}.`, json);
  }
  return json;
}

function fail(message, details) {
  console.error(`FAIL horus-chat-preview-e2e: ${message}`);
  console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}
