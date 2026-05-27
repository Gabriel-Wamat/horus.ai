import { createHash } from "node:crypto";
import { extname, isAbsolute, normalize, sep } from "node:path";
import {
  type AgentSkillFile,
  type AgentSkillValidationCheck,
  type AgentSkillValidationIssue,
  type AgentSkillValidationReport,
  type CreateAgentSkillFileInput,
  type ValidateAgentSkillInput,
} from "@u-build/shared";
import {
  AgentProfileAccessError,
  type AgentProfileRegistry,
  defaultAgentProfileRegistry,
} from "../../application/services/AgentProfileRegistry.js";
import { newId } from "../repositories/postgresUtils.js";

const MAX_SKILL_MD_BYTES = 96_000;
const MAX_SUPPORT_FILE_BYTES = 64_000;
const ALLOWED_TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".sh",
]);

const DENIED_PATH_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".env",
  ".ssh",
  "dist",
]);

export interface ValidatedSkillDraft {
  frontmatter: Record<string, unknown>;
  contentHash: string;
  report: AgentSkillValidationReport;
}

export class AgentSkillValidationService {
  constructor(
    private readonly profiles: AgentProfileRegistry = defaultAgentProfileRegistry
  ) {}

  validateDraft(
    input: ValidateAgentSkillInput,
    options: { revisionId?: string } = {}
  ): ValidatedSkillDraft {
    const revisionId = options.revisionId ?? newId();
    const checks: AgentSkillValidationCheck[] = [];
    const issues: AgentSkillValidationIssue[] = [];
    const frontmatter = parseSkillFrontmatter(input.skillMd);

    this.checkSkillMd(input.skillMd, frontmatter, checks, issues);
    this.checkSupportFiles(input.files, checks, issues);
    this.checkBindings(input.bindingAgentProfileIds, checks, issues);

    const contentHash = hashSkillBundle(input.skillMd, input.files);
    const failed = issues.some((issue) => issue.severity === "error");
    const report: AgentSkillValidationReport = {
      id: newId(),
      revisionId,
      status: failed ? "failed" : "passed",
      checks,
      issues,
      createdAt: new Date().toISOString(),
    };
    return { frontmatter, contentHash, report };
  }

  buildFile(
    revisionId: string,
    input: CreateAgentSkillFileInput
  ): AgentSkillFile {
    const contentText = input.contentText ?? "";
    return {
      id: newId(),
      revisionId,
      relativePath: input.relativePath,
      mediaType: input.mediaType,
      sizeBytes: Buffer.byteLength(contentText, "utf8"),
      contentText,
      contentSha256: sha256(contentText),
    };
  }

  private checkSkillMd(
    skillMd: string,
    frontmatter: Record<string, unknown>,
    checks: AgentSkillValidationCheck[],
    issues: AgentSkillValidationIssue[]
  ): void {
    const sizeBytes = Buffer.byteLength(skillMd, "utf8");
    if (sizeBytes > MAX_SKILL_MD_BYTES) {
      issues.push({
        severity: "error",
        code: "skill_md_too_large",
        message: `SKILL.md exceeds ${MAX_SKILL_MD_BYTES} bytes.`,
        path: "SKILL.md",
      });
      checks.push({
        code: "skill_md_size",
        status: "failed",
        message: "SKILL.md is too large.",
      });
    } else {
      checks.push({
        code: "skill_md_size",
        status: "passed",
        message: "SKILL.md is within the supported size limit.",
      });
    }

    if (skillMd.trim().length === 0) {
      issues.push({
        severity: "error",
        code: "skill_md_empty",
        message: "SKILL.md must contain instructions.",
        path: "SKILL.md",
      });
    }

    const hasName = typeof frontmatter["name"] === "string";
    const hasDescription = typeof frontmatter["description"] === "string";
    if (!hasName || !hasDescription) {
      issues.push({
        severity: "warning",
        code: "frontmatter_incomplete",
        message: "SKILL.md should include name and description frontmatter.",
        path: "SKILL.md",
      });
      checks.push({
        code: "frontmatter",
        status: "warning",
        message: "Required catalog metadata is incomplete.",
      });
    } else {
      checks.push({
        code: "frontmatter",
        status: "passed",
        message: "Skill frontmatter includes catalog metadata.",
      });
    }
  }

  private checkSupportFiles(
    files: CreateAgentSkillFileInput[],
    checks: AgentSkillValidationCheck[],
    issues: AgentSkillValidationIssue[]
  ): void {
    let failed = false;
    for (const file of files) {
      if (!isSafeRelativePath(file.relativePath)) {
        failed = true;
        issues.push({
          severity: "error",
          code: "unsafe_support_file_path",
          message: "Support file path must stay inside the skill bundle.",
          path: file.relativePath,
        });
      }
      const extension = extname(file.relativePath).toLowerCase();
      if (!ALLOWED_TEXT_EXTENSIONS.has(extension)) {
        failed = true;
        issues.push({
          severity: "error",
          code: "unsupported_support_file_type",
          message: `Unsupported support file extension: ${extension || "(none)"}.`,
          path: file.relativePath,
        });
      }
      const sizeBytes = Buffer.byteLength(file.contentText ?? "", "utf8");
      if (sizeBytes > MAX_SUPPORT_FILE_BYTES) {
        failed = true;
        issues.push({
          severity: "error",
          code: "support_file_too_large",
          message: `Support file exceeds ${MAX_SUPPORT_FILE_BYTES} bytes.`,
          path: file.relativePath,
        });
      }
      if (extension === ".sh" || file.relativePath.includes(`${sep}scripts${sep}`)) {
        issues.push({
          severity: "warning",
          code: "script_not_executable",
          message:
            "Scripts can be stored as references but are not executable by agents in this spec.",
          path: file.relativePath,
        });
      }
    }
    checks.push({
      code: "support_files",
      status: failed ? "failed" : "passed",
      message: failed
        ? "One or more support files are unsafe."
        : "Support files are safe to store.",
    });
  }

  private checkBindings(
    agentProfileIds: string[],
    checks: AgentSkillValidationCheck[],
    issues: AgentSkillValidationIssue[]
  ): void {
    let failed = false;
    for (const agentProfileId of agentProfileIds) {
      try {
        this.profiles.getProfile(agentProfileId as never);
      } catch (err) {
        if (err instanceof AgentProfileAccessError) {
          failed = true;
          issues.push({
            severity: "error",
            code: "unknown_agent_profile",
            message: `Unknown agent profile: ${agentProfileId}.`,
            path: null,
          });
          continue;
        }
        throw err;
      }
    }
    checks.push({
      code: "agent_bindings",
      status: failed ? "failed" : "passed",
      message: failed
        ? "At least one binding targets an unknown agent profile."
        : "Agent bindings target known profiles.",
    });
  }
}

export function parseSkillFrontmatter(skillMd: string): Record<string, unknown> {
  const trimmed = skillMd.trimStart();
  if (!trimmed.startsWith("---")) return {};
  const lines = trimmed.split(/\r?\n/);
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex <= 0) return {};
  const frontmatter: Record<string, unknown> = {};
  for (const line of lines.slice(1, endIndex)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    frontmatter[key] = value;
  }
  return frontmatter;
}

export function hashSkillBundle(
  skillMd: string,
  files: CreateAgentSkillFileInput[]
): string {
  const hash = createHash("sha256");
  hash.update(skillMd);
  for (const file of [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )) {
    hash.update("\0");
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.contentText ?? "");
  }
  return hash.digest("hex");
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isSafeRelativePath(path: string): boolean {
  if (isAbsolute(path)) return false;
  const normalized = normalize(path);
  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    return false;
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  return segments.every((segment) => !DENIED_PATH_SEGMENTS.has(segment));
}
