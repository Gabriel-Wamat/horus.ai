import { useState, type JSX } from "react";
import type { WorkflowState, AgentResult } from "@u-build/shared";

interface TestCase {
  id: string;
  criterion: string;
  steps: string[];
  expected: string;
}

interface StoryArtifact {
  storyId: string;
  storyTitle: string;
  html: string | null;
  testCases: TestCase[];
}

function extractArtifacts(state: WorkflowState): StoryArtifact[] {
  return state.userStories.map((story) => {
    const results: AgentResult[] = state.agentResults[story.id] ?? [];

    const frontResult = results.find(
      (r): r is Extract<AgentResult, { status: "success" }> =>
        r.status === "success" && r.agentName === "front"
    );
    const html =
      frontResult?.status === "success"
        ? (frontResult.output["html"] as string | undefined) ?? null
        : null;

    const qaResult = results.find(
      (r): r is Extract<AgentResult, { status: "success" }> =>
        r.status === "success" && r.agentName === "qa"
    );
    const testCases =
      qaResult?.status === "success"
        ? ((qaResult.output["testCases"] as TestCase[] | undefined) ?? [])
        : [];

    return { storyId: story.id, storyTitle: story.title, html, testCases };
  });
}

interface ArtifactsPanelProps {
  readonly state: WorkflowState;
  readonly threadId: string;
}

export function ArtifactsPanel({ state, threadId }: ArtifactsPanelProps): JSX.Element {
  const artifacts = extractArtifacts(state);
  const [activeStory, setActiveStory] = useState<string>(artifacts[0]?.storyId ?? "");
  const [activeTab, setActiveTab] = useState<"preview" | "tests">("preview");
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const current = artifacts.find((a) => a.storyId === activeStory) ?? artifacts[0];
  const hasAnyArtifact = artifacts.some((a) => a.html || a.testCases.length > 0);

  if (!hasAnyArtifact) return <></>;

  const downloadUrl = `/api/workflow/download/${threadId}`;

  return (
    <section className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded bg-violet-600 flex items-center justify-center">
            <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
          </div>
          <h2 className="font-semibold text-white text-sm">Artefatos Gerados</h2>
        </div>

        <a
          href={downloadUrl}
          download
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Baixar ZIP
        </a>
      </div>

      {/* Story tabs (if more than one) */}
      {artifacts.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {artifacts.map((a) => (
            <button
              key={a.storyId}
              onClick={() => setActiveStory(a.storyId)}
              className={`flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeStory === a.storyId
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {a.storyTitle.length > 30 ? `${a.storyTitle.slice(0, 30)}…` : a.storyTitle}
            </button>
          ))}
        </div>
      )}

      {/* Content tabs */}
      {current && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-800">
            {current.html && (
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "preview"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Preview HTML
              </button>
            )}
            {current.testCases.length > 0 && (
              <button
                onClick={() => setActiveTab("tests")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "tests"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Casos de Teste
                <span className="ml-1 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {current.testCases.length}
                </span>
              </button>
            )}
          </div>

          {/* HTML Preview */}
          {activeTab === "preview" && current.html && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
                <span className="text-[11px] text-slate-500 font-mono truncate">
                  {current.storyTitle}
                </span>
                <button
                  onClick={() => setPreviewExpanded((v) => !v)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                >
                  {previewExpanded ? (
                    <>
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                      </svg>
                      Reduzir
                    </>
                  ) : (
                    <>
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                      Expandir
                    </>
                  )}
                </button>
              </div>
              <iframe
                srcDoc={current.html}
                title={`Preview: ${current.storyTitle}`}
                sandbox="allow-scripts"
                className={`w-full bg-white transition-all duration-300 ${
                  previewExpanded ? "h-[600px]" : "h-80"
                }`}
              />
            </div>
          )}

          {/* Test cases */}
          {activeTab === "tests" && current.testCases.length > 0 && (
            <div className="divide-y divide-slate-800">
              {current.testCases.map((tc) => (
                <details key={tc.id} className="group">
                  <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors list-none">
                    <span className="flex-shrink-0 rounded bg-violet-900/50 border border-violet-800 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-violet-400">
                      {tc.id}
                    </span>
                    <span className="text-sm text-slate-200 flex-1">{tc.criterion}</span>
                    <svg
                      className="size-3.5 text-slate-500 transition-transform group-open:rotate-180 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </summary>
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                        Passos
                      </p>
                      <ol className="flex flex-col gap-1">
                        {tc.steps.map((step, stepIdx) => (
                          <li key={`${tc.id}-step-${step.slice(0, 20)}`} className="flex gap-2 text-sm text-slate-300">
                            <span className="flex-shrink-0 text-slate-500 font-mono text-xs mt-0.5">
                              {String(stepIdx + 1).padStart(2, "0")}.
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-lg bg-emerald-950/40 border border-emerald-900/50 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600 mb-0.5">
                        Resultado Esperado
                      </p>
                      <p className="text-sm text-emerald-300/80">{tc.expected}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
