import { useState, type JSX } from "react";
import {
  getLatestSuccessfulAgentResult,
  type WorkflowState,
  type AgentResult,
} from "@u-build/shared";

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

    const frontResult = getLatestSuccessfulAgentResult(results, "front");
    const html =
      frontResult?.status === "success"
        ? (frontResult.output["html"] as string | undefined) ?? null
        : null;

    const qaResult = getLatestSuccessfulAgentResult(results, "qa");
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
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Delivery</p>
          <h2 className="panel-title">Artefatos gerados</h2>
        </div>
        <a
          href={downloadUrl}
          download
          className="primary-button"
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Baixar ZIP
        </a>
      </div>

      <div className="panel-body">
        {artifacts.length > 1 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14 }}>
            {artifacts.map((a) => (
              <button
                type="button"
                key={a.storyId}
                onClick={() => setActiveStory(a.storyId)}
                className={`inspector-tab ${activeStory === a.storyId ? "active" : ""}`}
              >
                {a.storyTitle.length > 30 ? `${a.storyTitle.slice(0, 30)}…` : a.storyTitle}
              </button>
            ))}
          </div>
        )}

        {current && (
          <div className="story-card">
            <div className="inspector-tabs" style={{ marginBottom: 12 }}>
            {current.html && (
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`inspector-tab ${activeTab === "preview" ? "active" : ""}`}
              >
                Preview HTML
              </button>
            )}
            {current.testCases.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("tests")}
                className={`inspector-tab ${activeTab === "tests" ? "active" : ""}`}
              >
                Casos de Teste
                <span className="status-chip-value">
                  {current.testCases.length}
                </span>
              </button>
            )}
          </div>

          {activeTab === "preview" && current.html && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <span className="status-chip-value">
                  {current.storyTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded((v) => !v)}
                  className="panel-action"
                >
                  {previewExpanded ? "Reduzir" : "Expandir"}
                </button>
              </div>
              <iframe
                srcDoc={current.html}
                title={`Preview: ${current.storyTitle}`}
                sandbox="allow-scripts"
                className="artifact-frame"
                style={{ height: previewExpanded ? 600 : 320 }}
              />
            </div>
          )}

          {activeTab === "tests" && current.testCases.length > 0 && (
            <div className="form-grid" style={{ gap: 8 }}>
              {current.testCases.map((tc) => (
                <details key={tc.id} className="story-card">
                  <summary style={{ display: "flex", cursor: "pointer", alignItems: "center", gap: 10 }}>
                    <span className="status-chip-value" style={{ color: "var(--p)" }}>
                      {tc.id}
                    </span>
                    <span className="message-body">{tc.criterion}</span>
                  </summary>
                  <div className="form-grid" style={{ marginTop: 12, gap: 12 }}>
                    <div>
                      <p className="panel-kicker">
                        Passos
                      </p>
                      <ol className="form-grid" style={{ gap: 6 }}>
                        {tc.steps.map((step, stepIdx) => (
                          <li key={`${tc.id}-step-${step.slice(0, 20)}`} style={{ display: "flex", gap: 8 }}>
                            <span className="criteria-index">
                              {String(stepIdx + 1).padStart(2, "0")}.
                            </span>
                            <span className="message-body">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="story-card" style={{ borderColor: "rgba(20, 199, 123, 0.18)", background: "rgba(20, 199, 123, 0.06)" }}>
                      <p className="panel-kicker" style={{ color: "var(--p)" }}>
                        Resultado Esperado
                      </p>
                      <p className="message-body">{tc.expected}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  );
}
