import type { JSX } from "react";
import type { VisualInstructionMode } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

export function VisualInstructionComposer({
  message,
  mode,
  disabled,
  isSubmitting,
  placeholder,
  submitLabel = "Enviar",
  onChangeMessage,
  onChangeMode,
  onSubmit,
}: {
  readonly message: string;
  readonly mode: VisualInstructionMode;
  readonly disabled: boolean;
  readonly isSubmitting: boolean;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly onChangeMessage: (message: string) => void;
  readonly onChangeMode: (mode: VisualInstructionMode) => void;
  readonly onSubmit: () => void;
}): JSX.Element {
  return (
    <section className="visual-composer" aria-label="Instrução visual">
      <div className="composer-input-row">
        <textarea
          className="textarea visual-composer-input"
          value={message}
          disabled={disabled || isSubmitting}
          onChange={(event) => onChangeMessage(event.target.value)}
          placeholder={placeholder ?? "Ask Horus... ex: reduza a densidade"}
        />
        <div className="composer-control-row">
          <div className="composer-mode-row">
            <button
              className={`composer-mode-button ${mode === "build" ? "active" : ""}`}
              type="button"
              disabled={disabled || isSubmitting}
              onClick={() => onChangeMode("build")}
            >
              <PreviewIcon name="code" />
              <span>Build</span>
            </button>
          </div>
          <button
            className="primary-button composer-send-button"
            type="button"
            disabled={disabled || isSubmitting || message.trim().length === 0}
            onClick={onSubmit}
          >
            <PreviewIcon name="send" />
            <span>{isSubmitting ? "Enviando" : submitLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
