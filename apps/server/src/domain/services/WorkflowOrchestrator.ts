import { Command } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import type { IStorageProvider, IEventStream, UserStory, HumanFeedback } from "@u-build/shared";
import { graph } from "../../infrastructure/langgraph/graph.js";

export interface StartWorkflowOptions {
  userStories: UserStory[];
}

export interface ResumeWorkflowOptions {
  threadId: string;
  userStoryId: string;
  feedback: HumanFeedback;
}

export class WorkflowOrchestrator {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: IEventStream
  ) {}

  async start(options: StartWorkflowOptions): Promise<{ threadId: string }> {
    const threadId = uuidv4();
    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
    };

    const initialState = {
      userStories: options.userStories,
      currentUSIndex: 0,
      specs: {},
      humanFeedback: {},
      agentResults: {},
      status: "running" as const,
      threadId,
    };

    this.events.emit({
      type: "status_changed",
      threadId,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    // Fire-and-forget: graph suspends at hitlCheckpointNode.
    // HTTP response returns threadId immediately.
    void this.runGraphStream(initialState, config, threadId);

    return { threadId };
  }

  async resume(options: ResumeWorkflowOptions): Promise<void> {
    const config = {
      configurable: { thread_id: options.threadId },
      streamMode: "updates" as const,
    };

    const command = new Command({ resume: options.feedback });

    void this.runGraphStream(command, config, options.threadId);
  }

  async getStatus(threadId: string) {
    return this.storage.load(threadId);
  }

  private async runGraphStream(
    input: Record<string, unknown> | Command,
    config: object,
    threadId: string
  ): Promise<void> {
    try {
      for await (const chunk of await graph.stream(input as Parameters<typeof graph.stream>[0], config)) {
        const nodeName = Object.keys(chunk)[0];
        console.log(`[WorkflowOrchestrator] Node completed: ${nodeName}`);
      }
    } catch (err) {
      this.events.emit({
        type: "error",
        threadId,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
