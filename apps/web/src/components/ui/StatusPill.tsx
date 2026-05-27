import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export type StatusPillTone = "neutral" | "active" | "done" | "warn" | "danger";

export function StatusPill({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusPillTone;
  children: ReactNode;
}): ReactNode {
  return (
    <span className={cn("story-status-pill", tone, className)} {...props}>
      {children}
    </span>
  );
}
