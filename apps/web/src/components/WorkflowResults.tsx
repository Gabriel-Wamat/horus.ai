import { useState, type JSX } from "react";
import type { WorkflowState } from "@u-build/shared";

interface TestCase {
  id: string;
  criterion: string;
  steps: string[];
  expected: string;
}

interface WorkflowResultsProps {
  state: WorkflowState;
}

function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ScoreBadge({ score, passed }: { score: number; passed: boolean }): JSX.Element {
  const color = passed
    ? "text-emerald-400 bg-emerald-950 border-emerald-800"
    : score >= 50
    ? "text-amber-400 bg-amber-950 border-amber-800"
    : "text-rose-400 bg-rose-950 border-rose-800";

  return (
    <span className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${color}`}>
      {passed ? "Passed" : "Failed"} · {score}/100
    </span>
  );
}

function HtmlPreviewCard({
  storyTitle,
  storyId,
  html,
  score,
  passed,
  notes,
}: {
  storyTitle: string;
  storyId: string;
  html: string;
  score: number;
  passed: boolean;
  notes: string;
}): JSX.Element {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg bg-sky-600/20 border border-sky-700 flex items-center justify-center shrink-0">
            <svg className="size-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{storyTitle}</p>
            <p className="text-xs text-slate-500 font-mono">US {storyId.slice(0, 8)}&hellip;</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScoreBadge score={score} passed={passed} />
          <button
            onClick={() => downloadHtml(html, `${storyId.slice(0, 8)}-page.html`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download HTML
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-300 hover:text-white bg-violet-950/50 hover:bg-violet-900/50 border border-violet-800 rounded-lg transition-all"
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
        </div>
      </div>

      {notes && (
        <div className="px-5 py-3 border-b border-slate-800">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Curator: </span>{notes}
          </p>
        </div>
      )}

      {showPreview && (
        <div className="p-4">
          <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            className="w-full rounded-lg border border-slate-700 bg-white"
            style={{ height: "480px" }}
            title={`Preview — ${storyTitle}`}
          />
        </div>
      )}
    </div>
  );
}

function QaResultCard({
  storyTitle,
  storyId,
  testCases,
}: {
  storyTitle: string;
  storyId: string;
  testCases: TestCase[];
}): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg bg-emerald-600/20 border border-emerald-700 flex items-center justify-center shrink-0">
            <svg className="size-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-white truncate">{storyTitle}</p>
            <p className="text-xs text-slate-500">
              {testCases.length} test {testCases.length === 1 ? "case" : "cases"} · US {storyId.slice(0, 8)}&hellip;
            </p>
          </div>
        </div>
        <svg
          className={`size-4 text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 flex flex-col gap-3 border-t border-slate-800 pt-4">
          {testCases.map((tc) => (
            <div key={tc.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-[10px] font-mono font-semibold text-violet-400 bg-violet-950 border border-violet-800 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                  {tc.id}
                </span>
                <p className="text-sm font-medium text-white leading-snug">{tc.criterion}</p>
              </div>
              <div className="pl-2 border-l border-slate-700 flex flex-col gap-1.5 mb-3">
                {tc.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-mono text-slate-600 shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-xs text-slate-400 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 bg-emerald-950/40 border border-emerald-900/50 rounded-md px-3 py-2">
                <svg className="size-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <p className="text-xs text-emerald-300 leading-relaxed">{tc.expected}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowResults({ state }: WorkflowResultsProps): JSX.Element {
  const stories = state.userStories;

  const storyResults = stories.map((story) => {
    const results = state.agentResults[story.id] ?? [];

    // Pick the last successful front/qa/curator results across all retries
    const allFront = results.filter((r) => r.agentName === "front" && r.status === "success");
    const allQa = results.filter((r) => r.agentName === "qa" && r.status === "success");
    const allCurator = results.filter((r) => r.agentName === "curator" && r.status === "success");

    const lastFront = allFront[allFront.length - 1];
    const lastQa = allQa[allQa.length - 1];
    const lastCurator = allCurator[allCurator.length - 1];

    const html = lastFront?.status === "success" ? (lastFront.output.html as string | undefined) : undefined;
    const testCases = lastQa?.status === "success" ? (lastQa.output.testCases as TestCase[] | undefined) : undefined;
    const curatorScore = lastCurator?.status === "success" ? (lastCurator.output.score as number | undefined) : undefined;
    const curatorPassed = lastCurator?.status === "success" ? (lastCurator.output.passed as boolean | undefined) : undefined;
    const curatorNotes = lastCurator?.status === "success" ? (lastCurator.output.notes as string | undefined) : undefined;

    return { story, html, testCases, curatorScore, curatorPassed, curatorNotes };
  });

  const hasAnyResult = storyResults.some((r) => r.html ?? r.testCases);

  if (!hasAnyResult) return <></>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Generated Artifacts
        </span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      {storyResults.map(({ story, html, testCases, curatorScore, curatorPassed, curatorNotes }) => (
        <div key={story.id} className="flex flex-col gap-3">
          {html && (
            <HtmlPreviewCard
              storyTitle={story.title}
              storyId={story.id}
              html={html}
              score={curatorScore ?? 0}
              passed={curatorPassed ?? false}
              notes={curatorNotes ?? ""}
            />
          )}
          {testCases && testCases.length > 0 && (
            <QaResultCard
              storyTitle={story.title}
              storyId={story.id}
              testCases={testCases}
            />
          )}
        </div>
      ))}
    </div>
  );
}
