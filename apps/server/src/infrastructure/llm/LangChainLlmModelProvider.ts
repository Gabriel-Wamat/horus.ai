import type {
  ChatLlmModel,
  CreateChatLlmModelInput,
  CreateStructuredLlmModelInput,
  LlmModelProvider,
  StructuredLlmModel,
} from "../../application/ports/LlmModelProviderPort.js";
import { createChatModel } from "./createChatModel.js";
import { invokeChatModel } from "./invokeChatModel.js";

export class LangChainLlmModelProvider implements LlmModelProvider {
  createStructuredModel<TOutput>(
    input: CreateStructuredLlmModelInput<TOutput>
  ): StructuredLlmModel<TOutput> {
    const model = createChatModel(
      input.role,
      input.defaults ?? {},
      input.llmSettings
    ).withStructuredOutput(input.schema);

    return {
      invoke: async (payload, options) =>
        input.schema.parse(
          await invokeChatModel<unknown>(model, payload, options?.signal)
        ),
    };
  }

  createChat<TOutput = unknown>(
    input: CreateChatLlmModelInput
  ): ChatLlmModel<TOutput> {
    const model = createChatModel(
      input.role,
      input.defaults ?? {},
      input.llmSettings
    );

    return {
      invoke: async (payload, options) =>
        (await invokeChatModel<unknown>(
          model,
          payload,
          options?.signal
        )) as TOutput,
    };
  }
}
