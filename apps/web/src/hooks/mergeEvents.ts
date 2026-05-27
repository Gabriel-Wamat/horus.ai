export function mergeByIdAndSequence<TEvent extends { id: string; sequence: number }>(
  base: readonly TEvent[],
  incoming: readonly TEvent[],
  getTimestamp: (event: TEvent) => string
): TEvent[] {
  const byId = new Map<string, TEvent>();
  for (const event of [...base, ...incoming]) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.sequence - right.sequence || getTimestamp(left).localeCompare(getTimestamp(right))
  );
}
