import type { JSX } from "react";
import type { VisualInstructionMode } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

export function VisualInstructionComposer({
  message,
  disabled,
  isSubmitting,
  placeholder,
  disabledReason,
  onChangeMessage,
  onCancel,
  onSubmit,
}: {
  readonly message: string;
  readonly mode: VisualInstructionMode;
  readonly disabled: boolean;
  readonly isSubmitting: boolean;
  readonly placeholder?: string;
  readonly disabledReason?: string | undefined;
  readonly submitLabel?: string;
  readonly onChangeMessage: (message: string) => void;
  readonly onChangeMode: (mode: VisualInstructionMode) => void;
  readonly onCancel?: () => void;
  readonly onSubmit: () => void;
}): JSX.Element {
  const canSubmit = !disabled && !isSubmitting && message.trim().length > 0;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    onSubmit();
  };

  return (
    <section
      className={`visual-composer${isSubmitting ? " is-submitting" : ""}`}
      aria-label="Mensagem para Horus"
    >
      <div className="composer-input-row">
        <textarea
          className="textarea visual-composer-input"
          value={message}
          disabled={disabled || isSubmitting}
          onChange={(event) => onChangeMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            handleSubmit();
          }}
          placeholder={placeholder ?? "Pergunte ou peça uma mudança..."}
        />
        <div className="composer-control-row">
          <span className="composer-ready-label">
            {isSubmitting ? "Executando" : disabledReason ?? "Pronto"}
          </span>
          {isSubmitting ? (
            <button
              className="secondary-action composer-cancel-button"
              type="button"
              aria-label="Cancelar resposta"
              title="Cancelar"
              onClick={onCancel}
            >
              <PreviewIcon name="pause" />
            </button>
          ) : (
            <button
              className="primary-button composer-send-button"
              type="button"
              aria-label="Enviar mensagem"
              title="Enviar"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              <PreviewIcon name="sendUp" />
            </button>
          )}
        </div>
      </div>
      <div className="composer-status-row" aria-live="polite">
        <span>{isSubmitting ? "Aguarde ou cancele" : "Enter envia · Shift+Enter quebra linha"}</span>
        <span>{message.trim().length}/8000</span>
      </div>
    </section>
  );
}
