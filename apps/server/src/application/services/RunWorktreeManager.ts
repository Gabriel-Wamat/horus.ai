import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

// Creates an ephemeral git worktree per agent run so concurrent runs and
// failed retries don't contaminate the operator's main workspace. The agent
// pipeline writes/validates inside the worktree path; promote() moves the
// validated branch back into the operator's tree when the curator approves.
//
// Lifecycle:
//   1. acquire(runId, sourceRef)  → returns RunWorktreeHandle { path, branch }
//   2. agent runs validation inside handle.path
//   3a. release(handle, "promote") → merges branch back into source, removes worktree
//   3b. release(handle, "discard") → removes worktree without merging
//
// The manager keeps the worktree under <projectRoot>/.horus/runs/<runId> by
// default. Callers can override with `worktreesDir`.

const execFileAsync = promisify(execFile);

export interface RunWorktreeManagerOptions {
  readonly worktreesDir?: string | undefined;
  readonly branchPrefix?: string | undefined;
  readonly gitExecutable?: string | undefined;
}

export interface AcquireWorktreeInput {
  readonly projectRootPath: string;
  readonly runId: string;
  readonly sourceRef?: string | undefined;
}

export interface RunWorktreeHandle {
  readonly runId: string;
  readonly projectRootPath: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly sourceRef: string;
}

export type ReleaseMode = "promote" | "discard";

export interface ReleaseWorktreeInput {
  readonly handle: RunWorktreeHandle;
  readonly mode: ReleaseMode;
  readonly mergeMessage?: string | undefined;
}

export interface ReleaseWorktreeResult {
  readonly removed: boolean;
  readonly mergedInto?: string;
  readonly notes: readonly string[];
}

export class RunWorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunWorktreeError";
  }
}

export class RunWorktreeManager {
  private readonly worktreesDir: string | undefined;
  private readonly branchPrefix: string;
  private readonly gitExecutable: string;

  constructor(options: RunWorktreeManagerOptions = {}) {
    this.worktreesDir = options.worktreesDir;
    this.branchPrefix = options.branchPrefix ?? "horus-run";
    this.gitExecutable = options.gitExecutable ?? "git";
  }

  async acquire(input: AcquireWorktreeInput): Promise<RunWorktreeHandle> {
    const projectRoot = await fs.realpath(input.projectRootPath);
    await this.assertInsideGitRepo(projectRoot);
    const sourceRef = input.sourceRef ?? (await this.currentBranch(projectRoot));
    const baseDir =
      this.worktreesDir ?? join(projectRoot, ".horus", "runs");
    const worktreePath = resolve(baseDir, input.runId);
    const branch = `${this.branchPrefix}/${input.runId}`;

    await fs.mkdir(baseDir, { recursive: true }).catch(() => undefined);
    await this.git(projectRoot, [
      "worktree",
      "add",
      "-b",
      branch,
      worktreePath,
      sourceRef,
    ]);

    return {
      runId: input.runId,
      projectRootPath: projectRoot,
      worktreePath,
      branch,
      sourceRef,
    };
  }

  async release(input: ReleaseWorktreeInput): Promise<ReleaseWorktreeResult> {
    const notes: string[] = [];
    let mergedInto: string | undefined;
    if (input.mode === "promote") {
      // Squash-merge the run branch back into the source ref so the operator's
      // working tree gains a single coherent commit per run. Falls back to a
      // regular merge if squash is not appropriate.
      try {
        await this.git(input.handle.projectRootPath, [
          "checkout",
          input.handle.sourceRef,
        ]);
        await this.git(input.handle.projectRootPath, [
          "merge",
          "--squash",
          input.handle.branch,
        ]);
        await this.git(input.handle.projectRootPath, [
          "commit",
          "-m",
          input.mergeMessage ?? `Promote ${input.handle.branch}`,
        ]);
        mergedInto = input.handle.sourceRef;
        notes.push(`Squash-merged ${input.handle.branch} into ${input.handle.sourceRef}.`);
      } catch (err) {
        notes.push(
          `Promote failed: ${err instanceof Error ? err.message : String(err)}`
        );
        throw new RunWorktreeError(
          `Failed to promote worktree ${input.handle.runId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    // Always remove the worktree at the end — both promote and discard paths.
    let removed = false;
    try {
      await this.git(input.handle.projectRootPath, [
        "worktree",
        "remove",
        input.handle.worktreePath,
        "--force",
      ]);
      removed = true;
    } catch (err) {
      notes.push(
        `worktree remove failed (continuing): ${err instanceof Error ? err.message : String(err)}`
      );
    }
    // Delete the run branch in both modes:
    //   - discard: nothing was merged, branch is dead weight.
    //   - promote: squash-merge integrated the work into the source ref, so
    //     the original branch is also dead weight.
    await this.git(input.handle.projectRootPath, [
      "branch",
      "-D",
      input.handle.branch,
    ]).catch((err: unknown) => {
      notes.push(
        `branch delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });
    return {
      removed,
      ...(mergedInto ? { mergedInto } : {}),
      notes,
    };
  }

  async listActive(projectRootPath: string): Promise<string[]> {
    const root = await fs.realpath(projectRootPath);
    const { stdout } = await this.git(root, ["worktree", "list", "--porcelain"]);
    return stdout
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim())
      .filter((path) => path && path !== root);
  }

  private async assertInsideGitRepo(projectRoot: string): Promise<void> {
    try {
      await this.git(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
    } catch (err) {
      throw new RunWorktreeError(
        `Project root is not a git working tree: ${projectRoot} (${err instanceof Error ? err.message : String(err)})`
      );
    }
  }

  private async currentBranch(projectRoot: string): Promise<string> {
    const { stdout } = await this.git(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return stdout.trim();
  }

  private async git(
    cwd: string,
    args: readonly string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(this.gitExecutable, [...args], {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
  }
}

export const defaultRunWorktreeManager = new RunWorktreeManager();
