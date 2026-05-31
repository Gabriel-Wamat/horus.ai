import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
  HorusChatIntent,
  LlmSettings,
  LlmSettingsReference,
  PreviewSession,
  UserStory,
} from "@u-build/shared";
import type { HorusChatResponderStreamEvent } from "./HorusChatAgentStreamEvents.js";

export interface PreviewRuntimeReader {
  listProjects(): Promise<FrontendProject[]>;
  getSession(sessionId: string): Promise<PreviewSession>;
  createSession(input: {
    projectId: string;
    route?: string;
    device?: "pc" | "phone" | "tablet";
  }): Promise<{ session: PreviewSession }>;
  startSession(sessionId: string): Promise<{ session: PreviewSession }>;
  stopSession(sessionId: string): Promise<{ session: PreviewSession }>;
  reloadSession(sessionId: string): Promise<{ session: PreviewSession }>;
}

export interface CodeContextReader {
  buildContext(input: {
    project: FrontendProject;
    chatContext: ChatAgentContextBundle;
    query: string;
  }): Promise<CodeContextBundle>;
}

export interface HorusChatResponderInput {
  message: string;
  context: ChatAgentContextBundle;
  intentKind?: HorusChatIntent["kind"];
  project?: FrontendProject;
  codeContext?: CodeContextBundle;
  llmSettings?: LlmSettings;
  signal?: AbortSignal;
}

export interface HorusChatResponder {
  answer(input: HorusChatResponderInput): Promise<string>;
  streamAnswer?(input: HorusChatResponderInput): AsyncIterable<string>;
  streamAgent?(
    input: HorusChatResponderInput
  ): AsyncIterable<HorusChatResponderStreamEvent>;
}

export interface SpecGenerationExecutor {
  startSpecGeneration(input: {
    workspaceFolderId: string;
    userStory: UserStory;
    chatSessionId: string;
    sourceMessageId: string;
    executionBrief: string;
    llmSettings?: LlmSettings;
    idempotencyKey?: string;
    signal?: AbortSignal;
  }): Promise<{ threadId: string }>;
}

export interface HorusChatLlmSettingsResolver {
  resolveReference(
    reference?: LlmSettingsReference
  ): Promise<LlmSettings | undefined>;
}
