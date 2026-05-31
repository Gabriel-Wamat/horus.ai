import { getCurrentAgentAbortSignal } from "../langgraph/AgentRuntimeIsolationContext.js";

export interface ChatModelInvoker<TOutput = unknown> {
  invoke(input: unknown, options?: unknown): Promise<TOutput>;
}

type ChatModelInvokeOptions = { signal?: AbortSignal };

export function buildChatModelInvokeOptions(
  signal: AbortSignal | undefined = getCurrentAgentAbortSignal()
): ChatModelInvokeOptions | undefined {
  if (!signal) return undefined;
  return { signal } as ChatModelInvokeOptions;
}

export async function invokeChatModel<TOutput>(
  model: ChatModelInvoker<TOutput>,
  input: unknown,
  signal: AbortSignal | undefined = getCurrentAgentAbortSignal()
): Promise<TOutput> {
  return model.invoke(input, buildChatModelInvokeOptions(signal));
}

export function createLinkedAbortController(
  parentSignal: AbortSignal | undefined = getCurrentAgentAbortSignal()
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  if (!parentSignal) return { controller, cleanup: () => undefined };

  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
    return { controller, cleanup: () => undefined };
  }

  const abort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", abort, { once: true });
  return {
    controller,
    cleanup: () => parentSignal.removeEventListener("abort", abort),
  };
}
