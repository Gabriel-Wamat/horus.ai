export class HorusChatTurnLockRegistry {
  private readonly activeTurnLocks = new Map<string, Promise<void>>();

  async acquire(
    chatSessionId: string,
    idempotencyKey: string | undefined
  ): Promise<() => void> {
    if (!idempotencyKey) return () => undefined;

    const lockKey = `${chatSessionId}:${idempotencyKey}`;
    const previous = this.activeTurnLocks.get(lockKey) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);
    this.activeTurnLocks.set(lockKey, next);
    await previous.catch(() => undefined);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      releaseCurrent();
      if (this.activeTurnLocks.get(lockKey) === next) {
        this.activeTurnLocks.delete(lockKey);
      }
    };
  }
}
