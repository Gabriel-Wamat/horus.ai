import { useCallback, useEffect, useMemo, useState } from "react";
import {
  agentFlowApi,
  type AgentDebugTraceEntryView,
} from "../utils/agentFlowApi.js";

// "Why did the agent choose this?" debug panel. Powers item 10 of the
// architectural agenda. Fetches the in-memory trace buffer from the server
// and renders per-turn decisions for the selected workflow + story + agent.
//
// Designed to be embeddable inside the RunFlowDrawer (or a dedicated debug
// tab). The component is self-contained: it owns its loading state and
// refreshes on filter changes. Use the onClose prop if mounting inside a
// modal/drawer.

interface AgentDebugTracePanelProps {
  workflowThreadId?: string | null;
  userStoryId?: string | null;
  projectId?: string | null;
  // Optional filter for a single agent. When omitted, renders all agents.
  agentName?: "front" | "qa" | "curator" | "spec" | "odin" | null;
  limit?: number;
  autoRefreshMs?: number | null;
  onClose?: () => void;
}

export function AgentDebugTracePanel({
  workflowThreadId,
  userStoryId,
  projectId,
  agentName,
  limit = 32,
  autoRefreshMs = null,
  onClose,
}: AgentDebugTracePanelProps) {
  const [entries, setEntries] = useState<AgentDebugTraceEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(
    agentName ?? null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await agentFlowApi.listAgentDebugTraces({
        ...(workflowThreadId ? { workflowThreadId } : {}),
        ...(userStoryId ? { userStoryId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(selectedAgent ? { agentName: selectedAgent } : {}),
        limit,
      });
      setEntries(response.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traces.");
    } finally {
      setLoading(false);
    }
  }, [workflowThreadId, userStoryId, projectId, selectedAgent, limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const id = setInterval(load, autoRefreshMs);
    return () => clearInterval(id);
  }, [load, autoRefreshMs]);

  const grouped = useMemo(() => groupByAgent(entries), [entries]);

  return (
    <section
      aria-label="Agent debug trace"
      style={panelStyle}
    >
      <header style={headerStyle}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Agent decisions
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={selectedAgent ?? ""}
            onChange={(event) =>
              setSelectedAgent(event.target.value || null)
            }
            aria-label="Filter by agent"
            style={selectStyle}
          >
            <option value="">All agents</option>
            <option value="front">Front</option>
            <option value="qa">QA</option>
            <option value="curator">Curator</option>
            <option value="spec">Spec</option>
            <option value="odin">Odin</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={buttonStyle}
          >
            {loading ? "…" : "Refresh"}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              style={buttonStyle}
              aria-label="Close debug panel"
            >
              Close
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}

      {entries.length === 0 && !loading ? (
        <p style={emptyStyle}>
          No debug traces yet. Run a turn to see the agent's decisions here.
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {grouped.map(([agent, items]) => (
          <div key={agent} style={groupStyle}>
            <h4 style={groupHeadingStyle}>
              {agent} <span style={countBadgeStyle}>{items.length}</span>
            </h4>
            <ol style={listStyle}>
              {items.map((entry) => (
                <li key={entry.id} style={entryStyle(entry.outcome)}>
                  <div style={entryHeaderStyle}>
                    <span>
                      <strong>turn {entry.turn}</strong> · {entry.action}
                    </span>
                    <span>{formatRelative(entry.createdAt)}</span>
                  </div>
                  {entry.hypothesis ? (
                    <p style={hypothesisStyle}>{entry.hypothesis}</p>
                  ) : null}
                  <dl style={metaStyle}>
                    <dt>Outcome</dt>
                    <dd style={outcomeBadgeStyle(entry.outcome)}>
                      {entry.outcome}
                    </dd>
                    {entry.contextSummary.stack ? (
                      <>
                        <dt>Stack</dt>
                        <dd>{entry.contextSummary.stack}</dd>
                      </>
                    ) : null}
                    <dt>Runtime hints</dt>
                    <dd>{entry.contextSummary.runtimeHintCount}</dd>
                    {entry.contextSummary.requiredValidationKinds.length > 0 ? (
                      <>
                        <dt>Required validation</dt>
                        <dd>
                          {entry.contextSummary.requiredValidationKinds.join(", ")}
                        </dd>
                      </>
                    ) : null}
                    {entry.durationMs > 0 ? (
                      <>
                        <dt>Duration</dt>
                        <dd>{entry.durationMs} ms</dd>
                      </>
                    ) : null}
                  </dl>
                  {entry.notes.length > 0 ? (
                    <ul style={notesListStyle}>
                      {entry.notes.map((note, idx) => (
                        <li key={`${entry.id}-note-${idx}`}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.filesWritten.length > 0 ? (
                    <p style={fileListStyle}>
                      <strong>files written:</strong>{" "}
                      {entry.filesWritten.slice(0, 6).join(", ")}
                      {entry.filesWritten.length > 6
                        ? ` +${entry.filesWritten.length - 6} more`
                        : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByAgent(
  entries: readonly AgentDebugTraceEntryView[]
): Array<[string, AgentDebugTraceEntryView[]]> {
  const buckets = new Map<string, AgentDebugTraceEntryView[]>();
  for (const entry of entries) {
    const key = entry.agentName ?? "unknown";
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return iso;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  background: "var(--horus-surface, #0f172a)",
  color: "var(--horus-text, #e2e8f0)",
  borderRadius: 8,
  fontFamily: "var(--horus-font-stack, system-ui, sans-serif)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const selectStyle: React.CSSProperties = {
  background: "transparent",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
};

const buttonStyle: React.CSSProperties = {
  ...selectStyle,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "#fca5a5",
  fontSize: 12,
  margin: 0,
};

const emptyStyle: React.CSSProperties = {
  color: "rgba(226,232,240,0.7)",
  fontSize: 12,
  margin: 0,
};

const groupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const groupHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const countBadgeStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

function entryStyle(
  outcome: AgentDebugTraceEntryView["outcome"]
): React.CSSProperties {
  return {
    border: `1px solid ${outcomeColor(outcome, 0.4)}`,
    borderLeft: `3px solid ${outcomeColor(outcome, 1)}`,
    borderRadius: 6,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.02)",
  };
}

const entryHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  color: "rgba(226,232,240,0.9)",
};

const hypothesisStyle: React.CSSProperties = {
  margin: "6px 0",
  fontSize: 12,
  color: "rgba(226,232,240,0.85)",
  fontStyle: "italic",
};

const metaStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "4px 12px",
  margin: "6px 0",
  fontSize: 11,
};

function outcomeBadgeStyle(
  outcome: AgentDebugTraceEntryView["outcome"]
): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 4,
    background: outcomeColor(outcome, 0.2),
    color: outcomeColor(outcome, 1),
    fontWeight: 600,
  };
}

const notesListStyle: React.CSSProperties = {
  margin: "4px 0 0",
  paddingLeft: 16,
  fontSize: 11,
  color: "rgba(226,232,240,0.75)",
};

const fileListStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(226,232,240,0.75)",
  marginTop: 4,
  marginBottom: 0,
  overflowWrap: "anywhere",
};

function outcomeColor(
  outcome: AgentDebugTraceEntryView["outcome"],
  alpha: number
): string {
  switch (outcome) {
    case "success":
      return `rgba(74,222,128,${alpha})`;
    case "failure":
      return `rgba(248,113,113,${alpha})`;
    case "blocked":
      return `rgba(251,191,36,${alpha})`;
    case "skipped":
      return `rgba(148,163,184,${alpha})`;
    case "pending":
    default:
      return `rgba(96,165,250,${alpha})`;
  }
}
