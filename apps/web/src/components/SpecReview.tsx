import { useState, type JSX } from "react";
import type { Spec } from "@u-build/shared";

interface SpecReviewProps {
  spec: Spec;
  onApprove: (editedSpec?: Spec) => void;
  onReject: () => void;
}

export function SpecReview({ spec, onApprove, onReject }: SpecReviewProps): JSX.Element {
  const [editedSummary, setEditedSummary] = useState(spec.summary);
  const [editedApproach, setEditedApproach] = useState(spec.technicalApproach);

  const handleApprove = (): void => {
    const hasEdits =
      editedSummary !== spec.summary ||
      editedApproach !== spec.technicalApproach;

    onApprove(
      hasEdits
        ? { ...spec, summary: editedSummary, technicalApproach: editedApproach }
        : undefined
    );
  };

  return (
    <section aria-label="Spec Review">
      <h2>Review Spec — US {spec.userStoryId.slice(0, 8)}</h2>

      <label>
        Summary
        <textarea
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          rows={4}
        />
      </label>

      <label>
        Technical Approach
        <textarea
          value={editedApproach}
          onChange={(e) => setEditedApproach(e.target.value)}
          rows={6}
        />
      </label>

      <div>
        <h3>Components</h3>
        <ul>
          {spec.components.map((c) => (
            <li key={c.name}>
              <strong>{c.name}</strong> ({c.type}): {c.description}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <button onClick={handleApprove}>Approve</button>
        <button onClick={onReject}>Reject</button>
      </div>
    </section>
  );
}
