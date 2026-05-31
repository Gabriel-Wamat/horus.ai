import { randomUUID } from "node:crypto";
import {
  RunWorktreeManager,
  type RunWorktreeHandle,
} from "./RunWorktreeManager.js";

// Coordinator that wraps an arbitrary workflow step in a git-worktree-isolated
// path so concurrent runs and failed retries don't contaminate the operator's
// main workspace. Opt-in via the HORUS_RUN_WORKTREE env var (or explicit
// `enabled: true`) so existing flows keep working unchanged until the operator
// turns it on.
//
// Usage from a use case / node:
//
//   const result = await workflowRunIsolation.runIsolated({
//     projectRootPath: state.frontendProjectRootPath,
//     runId,
//     execute: async ({ rootPath }) => {
//       // ...run validation / agent loop against rootPath...
//       return { passed };
//     },
//   });
//
// runIsolated() guarantees release() is called even when execute() throws,
// and promotes the branch only when execute() returns success === true (or
// no boolean signal — in which case promote is the default).

export interface WorkflowRunIsolationOptions {
  readonly manager?: RunWorktreeManager | undefined;
  readonly enabled?: boolean | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

export interface RunIsolatedInput<T> {
  readonly projectRootPath: string | undefined;
  readonly runId?: string | undefined;
  readonly sourceRef?: string | undefined;
  // When execute() returns an object with `passed: false` the worktree is
  // discarded instead of promoted. Anything else (including undefined or a
  // truthy value) promotes by default.
  readonly execute: (context: {
    rootPath: string;
    isolated: boolean;
    handle?: RunWorktreeHandle;
  }) => Promise<T>;
  readonly mergeMessage?: string | undefined;
}

export interface RunIsolatedResult<T> {
  readonly value: T;
  readonly isolated: boolean;
  readonly handle?: RunWorktreeHandle;
  readonly notes: readonly string[];
}

export class WorkflowRunIsolation {
  private readonly manager: RunWorktreeManager;
  private readonly enabled: boolean;

  constructor(options: WorkflowRunIsolationOptions = {}) {
    this.manager = options.manager ?? new RunWorktreeManager();
    const envFlag = (options.env ?? process.env)["HORUS_RUN_WORKTREE"];
    this.enabled =
      options.enabled ??
      (envFlag === "true" || envFlag === "1" || envFlag === "on");
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async runIsolated<T>(input: RunIsolatedInput<T>): Promise<RunIsolatedResult<T>> {
    // Flag off OR no project root → pass-through. Workflow runs against the
    // operator's main working tree as before.
    if (!this.enabled || !input.projectRootPath) {
      const value = await input.execute({
        rootPath: input.projectRootPath ?? process.cwd(),
        isolated: false,
      });
      return { value, isolated: false, notes: [] };
    }

    const runId = input.runId ?? randomUUID();
    const handle = await this.manager.acquire({
      projectRootPath: input.projectRootPath,
      runId,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    });

    let executionError: unknown;
    let value: T | undefined;
    try {
      value = await input.execute({
        rootPath: handle.worktreePath,
        isolated: true,
        handle,
      });
    } catch (err) {
      executionError = err;
    }

    const mode: "promote" | "discard" = executionError
      ? "discard"
      : shouldDiscard(value)
        ? "discard"
        : "promote";
    const releaseResult = await this.manager
      .release({
        handle,
        mode,
        ...(input.mergeMessage ? { mergeMessage: input.mergeMessage } : {}),
      })
      .catch((err: unknown) => ({
        removed: false,
        notes: [
          `release_failed: ${err instanceof Error ? err.message : String(err)}`,
        ],
      }));

    if (executionError) throw executionError;
    return {
      value: value as T,
      isolated: true,
      handle,
      notes: releaseResult.notes,
    };
  }
}

function shouldDiscard(value: unknown): boolean {
  if (value && typeof value === "object" && "passed" in value) {
    return (value as { passed: unknown }).passed === false;
  }
  return false;
}

export const defaultWorkflowRunIsolation = new WorkflowRunIsolation();
