import type { PreviewEvent } from "@u-build/shared";

export function mergeEvents(
  current: PreviewEvent[],
  incoming: PreviewEvent[]
): PreviewEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
}

export function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
