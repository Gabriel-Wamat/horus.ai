import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { Eye, EyeOff, PlugZap, Trash2 } from "lucide-react";
import type {
  LlmProvider,
  LlmSettingsDraft,
  LlmSettingsProfile,
} from "@u-build/shared";

const PROVIDERS: Array<{ value: LlmProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "groq", label: "Groq" },
];

interface LlmSettingsModalProps {
  readonly isOpen: boolean;
  readonly profile: LlmSettingsProfile | null;
  readonly onSave: (
    settings: LlmSettingsDraft & {
      validationStatus?: "untested" | "valid" | "invalid";
      validationMessage?: string;
      validatedAt?: string;
    }
  ) => Promise<void>;
  readonly onTest: (
    settings: LlmSettingsDraft
  ) => Promise<{ ok: boolean; message: string; testedAt: string }>;
  readonly onDelete: () => Promise<void>;
  readonly onClose: () => void;
}

export function LlmSettingsModal({
  isOpen,
  profile,
  onSave,
  onTest,
  onDelete,
  onClose,
}: LlmSettingsModalProps): JSX.Element | null {
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    status: "untested" | "valid" | "invalid";
    message?: string;
    testedAt?: string;
  }>({ status: "untested" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setProvider(profile?.provider ?? "openai");
    setModel(profile?.model ?? "");
    setBaseUrl(profile?.baseUrl ?? "");
    setApiKey("");
    setIsRevealed(false);
    setError(null);
    setNotice(null);
    setValidation({
      status: profile?.validationStatus ?? "untested",
      ...(profile?.validationMessage ? { message: profile.validationMessage } : {}),
      ...(profile?.validatedAt ? { testedAt: profile.validatedAt } : {}),
    });

    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  }, [isOpen, profile]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const buildDraft = (): LlmSettingsDraft | null => {
    const trimmedModel = model.trim();
    const trimmedKey = apiKey.trim();
    const trimmedBaseUrl = baseUrl.trim();

    if (!trimmedModel) {
      setError("Informe um modelo.");
      return null;
    }
    if (!trimmedKey && !profile) {
      setError("Informe uma chave API.");
      return null;
    }

    return {
      provider,
      model: trimmedModel,
      persistenceMode: "persisted",
      ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      ...(trimmedBaseUrl ? { baseUrl: trimmedBaseUrl } : {}),
    };
  };

  const handleTest = async (): Promise<void> => {
    const draft = buildDraft();
    if (!draft) return;
    if (!draft.apiKey) {
      setError("Informe uma nova chave para testar. Chaves salvas não são expostas no navegador.");
      return;
    }
    setError(null);
    setNotice(null);
    setIsTesting(true);
    try {
      const result = await onTest(draft);
      setValidation({
        status: result.ok ? "valid" : "invalid",
        message: result.message,
        testedAt: result.testedAt,
      });
      setNotice(result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao testar provider.";
      setValidation({ status: "invalid", message });
      setError(message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const draft = buildDraft();
    if (!draft) return;

    setIsSubmitting(true);
    setError(null);
    void onSave({
      ...draft,
      validationStatus: validation.status,
      ...(validation.message ? { validationMessage: validation.message } : {}),
      ...(validation.testedAt ? { validatedAt: validation.testedAt } : {}),
    })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha ao salvar provider.");
      })
      .finally(() => setIsSubmitting(false));
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
            placeholder="ex: LLM_MODEL configurado no backend"
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
              placeholder={profile?.keyLast4 ? `Chave salva terminando em ${profile.keyLast4}` : ""}
            />
            <button
              className="secret-toggle"
              type="button"
              aria-label={isRevealed ? "Ocultar API key" : "Mostrar API key"}
              onClick={() => setIsRevealed((value) => !value)}
            >
              {isRevealed ? <EyeOff className="icon" /> : <Eye className="icon" />}
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Base URL</span>
          <input
            className="field-control"
            name="horus-llm-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="Default do provider"
            autoComplete="off"
          />
        </label>

        {profile && (
          <div className="settings-status">
            <span>{profile.provider}</span>
            <span>{profile.validationStatus}</span>
            {profile.keyLast4 && <span>key ****{profile.keyLast4}</span>}
          </div>
        )}

        {notice && <div className="form-notice">{notice}</div>}
        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          {profile && (
            <button
              className="secondary-action danger-action"
              type="button"
              disabled={isSubmitting || isTesting}
              onClick={() => {
                setIsSubmitting(true);
                void onDelete()
                  .then(onClose)
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Falha ao remover chave.")
                  )
                  .finally(() => setIsSubmitting(false));
              }}
            >
              <Trash2 className="button-icon" />
              Remover
            </button>
          )}
          <button
            className="secondary-action"
            type="button"
            disabled={isSubmitting || isTesting}
            onClick={() => void handleTest()}
          >
            <PlugZap className="button-icon" />
            {isTesting ? "Testando" : "Testar"}
          </button>
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-action" type="submit" disabled={isSubmitting || isTesting}>
            {isSubmitting ? "Salvando" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
