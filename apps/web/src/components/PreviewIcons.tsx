import type { JSX } from "react";

export type PreviewIconName =
  | "bolt"
  | "chevron"
  | "code"
  | "monitor"
  | "pause"
  | "phone"
  | "play"
  | "refresh"
  | "send"
  | "sendUp"
  | "tablet"
  | "terminal";

export function PreviewIcon({ name }: { name: PreviewIconName }): JSX.Element {
  if (name === "play") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 5 11 7-11 7V5Z" />
      </svg>
    );
  }

  if (name === "pause") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14M16 5v14" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
      </svg>
    );
  }

  if (name === "monitor") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  }

  if (name === "phone") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="2.75" width="10" height="18.5" rx="2.5" />
        <path d="M11 18h2" />
      </svg>
    );
  }

  if (name === "tablet") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2.5" />
        <path d="M11 18h2" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 11.5 16-7-7 16-2.5-7-6.5-2Z" />
        <path d="m10.5 13.5 3.5-3.5" />
      </svg>
    );
  }

  if (name === "sendUp") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    );
  }

  if (name === "terminal") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 7 5 5-5 5" />
        <path d="M12 19h8" />
      </svg>
    );
  }

  if (name === "code") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
        <path d="m14 5-4 14" />
      </svg>
    );
  }

  if (name === "bolt") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 5 14h6l-1 8 9-13h-6l0-7Z" />
      </svg>
    );
  }

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
