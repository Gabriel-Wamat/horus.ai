import { useState } from "react";

export type AppMode = "stories" | "files" | "preview" | "agents";

function readInitialMode(): AppMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "agents") return "agents";
  if (mode === "files") return "files";
  return mode === "preview" ? "preview" : "stories";
}

export function useAppNavigation(): {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
} {
  const [appMode, setAppModeState] = useState<AppMode>(readInitialMode);

  const setAppMode = (mode: AppMode): void => {
    setAppModeState(mode);
    const url = new URL(window.location.href);
    if (mode === "preview" || mode === "agents" || mode === "files") {
      url.searchParams.set("mode", mode);
    } else {
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return { appMode, setAppMode };
}
