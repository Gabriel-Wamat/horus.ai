import { z } from "zod";
import type { PreviewEvent, PreviewSession } from "@u-build/shared";

export const QaPreviewSmokeResultSchema = z.object({
  status: z.enum(["passed", "failed", "blocked"]),
  reason: z.string().trim().min(1),
  previewSessionId: z.string().uuid().optional(),
  previewStatus: z.string().optional(),
  previewUrl: z.string().url().optional(),
  statusCode: z.number().int().optional(),
  contentType: z.string().optional(),
  bodyBytes: z.number().int().nonnegative().optional(),
  elapsedMs: z.number().int().nonnegative(),
  checkedAt: z.string().datetime(),
  runtimeEvidence: z.record(z.string(), z.unknown()).optional(),
});

export type QaPreviewSmokeResult = z.infer<typeof QaPreviewSmokeResultSchema>;

export interface QaPreviewRuntimeReader {
  getSession(sessionId: string): Promise<PreviewSession>;
  listTimeline(sessionId: string): Promise<PreviewEvent[]>;
}

export interface QaPreviewSmokeValidationOptions {
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_BODY_CHARS = 8_000;

export class QaPreviewSmokeValidationService {
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly previewRuntime: QaPreviewRuntimeReader,
    options: QaPreviewSmokeValidationOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async validate(previewSessionId: string): Promise<QaPreviewSmokeResult> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    const session = await this.previewRuntime.getSession(previewSessionId);
    const timeline = await this.previewRuntime.listTimeline(previewSessionId);
    const runtimeEvidence = findLatestRuntimeEvidence(timeline);

    const base = {
      previewSessionId,
      previewStatus: session.status,
      ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
      ...(runtimeEvidence ? { runtimeEvidence } : {}),
    };

    if (session.status !== "running") {
      return this.result({
        status: "blocked",
        reason: `preview_not_running:${session.status}`,
        elapsedMs: Date.now() - startedAt,
        checkedAt,
        ...base,
      });
    }

    if (!session.previewUrl) {
      return this.result({
        status: "blocked",
        reason: "missing_preview_url",
        elapsedMs: Date.now() - startedAt,
        checkedAt,
        ...base,
      });
    }

    if (!runtimeEvidence) {
      return this.result({
        status: "blocked",
        reason: "missing_runtime_evidence",
        elapsedMs: Date.now() - startedAt,
        checkedAt,
        ...base,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(session.previewUrl, {
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const boundedBody = body.slice(0, MAX_BODY_CHARS);
      const bodyBytes = Buffer.byteLength(boundedBody);

      if (!response.ok) {
        return this.result({
          status: "failed",
          reason: "preview_http_error",
          statusCode: response.status,
          contentType,
          bodyBytes,
          elapsedMs: Date.now() - startedAt,
          checkedAt,
          ...base,
        });
      }

      if (!contentType.toLowerCase().includes("text/html")) {
        return this.result({
          status: "failed",
          reason: "preview_not_html",
          statusCode: response.status,
          contentType,
          bodyBytes,
          elapsedMs: Date.now() - startedAt,
          checkedAt,
          ...base,
        });
      }

      if (boundedBody.trim().length === 0) {
        return this.result({
          status: "failed",
          reason: "preview_empty_body",
          statusCode: response.status,
          contentType,
          bodyBytes,
          elapsedMs: Date.now() - startedAt,
          checkedAt,
          ...base,
        });
      }

      return this.result({
        status: "passed",
        reason: "preview_reachable",
        statusCode: response.status,
        contentType,
        bodyBytes,
        elapsedMs: Date.now() - startedAt,
        checkedAt,
        ...base,
      });
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "preview_request_timeout"
          : "preview_fetch_failed";
      return this.result({
        status: "failed",
        reason,
        elapsedMs: Date.now() - startedAt,
        checkedAt,
        ...base,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private result(input: QaPreviewSmokeResult): QaPreviewSmokeResult {
    return QaPreviewSmokeResultSchema.parse(input);
  }
}

function findLatestRuntimeEvidence(
  timeline: readonly PreviewEvent[]
): Record<string, unknown> | undefined {
  for (const event of [...timeline].reverse()) {
    const runtimeEvidence = event.data["runtimeEvidence"];
    if (
      runtimeEvidence &&
      typeof runtimeEvidence === "object" &&
      !Array.isArray(runtimeEvidence)
    ) {
      return runtimeEvidence as Record<string, unknown>;
    }
  }
  return undefined;
}
