export const CHAT_TURN_CANCELLED_MESSAGE =
  "Cancelado. Sua mensagem ficou salva para uma nova tentativa.";

export class HorusChatContextMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HorusChatContextMismatchError";
  }
}

export class HorusChatTurnCancelledError extends Error {
  constructor() {
    super("Horus chat turn was cancelled.");
    this.name = "HorusChatTurnCancelledError";
  }
}

export function throwIfHorusChatTurnAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new HorusChatTurnCancelledError();
  }
}
