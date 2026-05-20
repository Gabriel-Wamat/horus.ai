import type { JSX } from "react";
import type { WorkflowState } from "@u-build/shared";

interface UserStoryListProps {
  state: WorkflowState;
}

export function UserStoryList({ state }: UserStoryListProps): JSX.Element {
  return (
    <section>
      <h2>User Stories ({state.userStories.length})</h2>
      <ul>
        {state.userStories.map((us, i) => {
          const isComplete = i < state.currentUSIndex;
          const isCurrent = i === state.currentUSIndex;
          return (
            <li key={us.id}>
              <span>{isComplete ? "Done" : isCurrent ? "Active" : "Pending"}</span>{" "}
              <strong>{us.title}</strong>{" "}
              <span>[{us.priority}]</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
