import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type { LlmProvider, LlmSettings } from "@u-build/shared";

const PROVIDERS: Array<{ value: LlmProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "groq", label: "Groq" },
];

interface LlmSettingsModalProps {
  readonly isOpen: boolean;
  readonly settings: LlmSettings | null;
  readonly onSave: (settings: LlmSettings) => void;
  readonly onClose: () => void;
}

export function LlmSettingsModal({
  isOpen,
  settings,
  onSave,
  onClose,
}: LlmSettingsModalProps): JSX.Element | null {
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [model, setModel] = useState("gpt-5");
  const [apiKey, setApiKey] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setProvider(settings?.provider ?? "openai");
    setModel(settings?.model ?? "gpt-5");
    setApiKey(settings?.apiKey ?? "");
    setIsRevealed(false);
    setError(null);

    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const trimmedModel = model.trim();
    const trimmedKey = apiKey.trim();
    if (!trimmedModel) {
      setError("Informe um modelo.");
      return;
    }
    if (!trimmedKey) {
      setError("Informe uma chave API.");
      return;
    }

    onSave({
      provider,
      model: trimmedModel,
      apiKey: trimmedKey,
    });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-settings-title"
        onSubmit={handleSubmit}
      >
        <div className="modal-head">
          <div>
            <p className="panel-kicker">LLM runtime</p>
            <h2 className="panel-title" id="llm-settings-title">
              Configurações
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Fechar configurações"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label className="field">
          <span className="field-label">Provider</span>
          <select
            ref={firstFieldRef}
            className="field-control"
            name="horus-llm-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as LlmProvider)}
          >
            {PROVIDERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Modelo</span>
          <input
            className="field-control"
            name="horus-llm-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-5"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">API key</span>
          <div className="secret-control">
            <input
              className="field-control secret-input"
              name="horus-llm-api-key"
              type={isRevealed ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              className="secret-toggle"
              type="button"
              aria-label={isRevealed ? "Ocultar API key" : "Mostrar API key"}
              onClick={() => setIsRevealed((value) => !value)}
            >
              <EyeIcon hidden={isRevealed} />
            </button>
          </div>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-action" type="submit">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      {hidden && <path d="m4 20 16-16" />}
    </svg>
  );
}
