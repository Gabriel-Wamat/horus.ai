import type { ReactNode } from "react";

export function EmptyState({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="panel-body">
      {kicker ? <p className="panel-kicker">{kicker}</p> : null}
      <h2 className="panel-title">{title}</h2>
      <p className="workflow-meta">{description}</p>
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}
