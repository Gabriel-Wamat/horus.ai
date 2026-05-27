import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export function Panel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>): ReactNode {
  return (
    <section className={cn("panel", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="panel-head">
      <div>
        {kicker ? <p className="panel-kicker">{kicker}</p> : null}
        <h2 className="panel-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}
