import { spawn } from "node:child_process";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly cwd: string,
    readonly args: readonly string[],
    readonly stderr: string
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export class GitCommandExecutor {
  async run(cwd: string, args: readonly string[]): Promise<GitCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["-C", cwd, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.once("error", reject);
      child.once("close", (exitCode) => {
        const code = exitCode ?? 1;
        if (code !== 0) {
          reject(
            new GitCommandError(
              `git ${args.join(" ")} failed in ${cwd}: ${stderr.trim() || stdout.trim()}`,
              cwd,
              args,
              stderr
            )
          );
          return;
        }
        resolve({ stdout, stderr, exitCode: code });
      });
    });
  }

  async ensureLocalCommitIdentity(
    cwd: string,
    identity: { name: string; email: string }
  ): Promise<void> {
    const name = await this.readLocalConfig(cwd, "user.name");
    const email = await this.readLocalConfig(cwd, "user.email");
    if (!name) await this.run(cwd, ["config", "user.name", identity.name]);
    if (!email) await this.run(cwd, ["config", "user.email", identity.email]);
  }

  private async readLocalConfig(cwd: string, key: string): Promise<string | null> {
    try {
      const result = await this.run(cwd, ["config", "--local", "--get", key]);
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
