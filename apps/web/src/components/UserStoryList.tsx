import type { JSX } from "react";
import type { WorkflowState } from "@u-build/shared";

interface UserStoryListProps {
  state: WorkflowState;
}

export function UserStoryList({ state }: UserStoryListProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Queue</p>
          <h2 className="panel-title">User stories ({state.userStories.length})</h2>
        </div>
        <span className="status-chip">
          <span className="status-chip-label">status</span>
          <span className="status-chip-value">{state.status}</span>
        </span>
      </div>
      <div className="workflow-list">
        {state.userStories.map((us, i) => {
          const isComplete = i < state.currentUSIndex;
          const isCurrent = i === state.currentUSIndex;
          return (
            <div
              className={`workflow-step ${isComplete ? "completed" : isCurrent ? "active" : ""}`}
              key={us.id}
            >
              <span className={`step-dot ${isComplete ? "completed" : isCurrent ? "running" : ""}`} />
              <div>
                <p className="workflow-title">{us.title}</p>
                <p className="workflow-meta">{isComplete ? "Done" : isCurrent ? "Active" : "Pending"}</p>
              </div>
              <span className="status-chip-value">{us.priority}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
