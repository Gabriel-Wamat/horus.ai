import { useState, type JSX } from "react";
import type { UserStory } from "@u-build/shared";

interface StoryDraft {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: "low" | "medium" | "high" | "critical";
}

function createDraft(): StoryDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    acceptanceCriteria: [""],
    priority: "medium",
  };
}

const PRIORITY_LABELS: Record<StoryDraft["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const PRIORITY_COLORS: Record<StoryDraft["priority"], string> = {
  low: "text-emerald-400 bg-emerald-950 border-emerald-800",
  medium: "text-sky-400 bg-sky-950 border-sky-800",
  high: "text-amber-400 bg-amber-950 border-amber-800",
  critical: "text-rose-400 bg-rose-950 border-rose-800",
};

interface Props {
  onSubmit: (stories: UserStory[]) => Promise<void>;
  initialStories?: UserStory[];
}

export function UserStoryInputPage({ onSubmit, initialStories }: Props): JSX.Element {
  const [drafts, setDrafts] = useState<StoryDraft[]>(() =>
    initialStories && initialStories.length > 0
      ? initialStories.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          acceptanceCriteria: s.acceptanceCriteria,
          priority: s.priority,
        }))
      : [createDraft()]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = <K extends keyof StoryDraft>(
    id: string,
    field: K,
    value: StoryDraft[K]
  ) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const updateCriteria = (draftId: string, index: number, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        const criteria = [...d.acceptanceCriteria];
        criteria[index] = value;
        return { ...d, acceptanceCriteria: criteria };
      })
    );
  };

  const addCriteria = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, acceptanceCriteria: [...d.acceptanceCriteria, ""] }
          : d
      )
    );
  };

  const removeCriteria = (draftId: string, index: number) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        return {
          ...d,
          acceptanceCriteria: d.acceptanceCriteria.filter((_, i) => i !== index),
        };
      })
    );
  };

  const addStory = () => setDrafts((prev) => [...prev, createDraft()]);

  const removeStory = (id: string) => {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSubmit = async () => {
    for (const draft of drafts) {
      if (!draft.title.trim()) {
        setError("Todas as histórias precisam de um título.");
        return;
      }
      if (!draft.description.trim()) {
        setError("Todas as histórias precisam de uma descrição.");
        return;
      }
      if (draft.acceptanceCriteria.some((c) => !c.trim())) {
        setError("Remova os critérios de aceite vazios antes de continuar.");
        return;
      }
      if (draft.acceptanceCriteria.length === 0) {
        setError("Cada história precisa de ao menos um critério de aceite.");
        return;
      }
    }

    setError(null);
    setIsSubmitting(true);

    const stories: UserStory[] = drafts.map((d) => ({
      id: d.id,
      title: d.title.trim(),
      description: d.description.trim(),
      acceptanceCriteria: d.acceptanceCriteria.map((c) => c.trim()),
      priority: d.priority,
      labels: [],
      createdAt: new Date().toISOString(),
    }));

    try {
      await onSubmit(stories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o workflow.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">horus<span className="text-violet-400">.ai</span></span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Gerar Especificações</h1>
          <p className="text-slate-400">
            Descreva as histórias de usuário e deixe os agentes criarem as specs técnicas para você.
          </p>
        </div>

        {/* Story cards */}
        <div className="flex flex-col gap-5">
          {drafts.map((draft, storyIndex) => (
            <div
              key={draft.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative"
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  História #{storyIndex + 1}
                </span>
                {drafts.length > 1 && (
                  <button
                    onClick={() => removeStory(draft.id)}
                    className="size-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950 transition-colors"
                    title="Remover história"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {/* Title + Priority row */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Título <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => updateDraft(draft.id, "title", e.target.value)}
                      placeholder="Como usuário, quero…"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Prioridade
                    </label>
                    <select
                      value={draft.priority}
                      onChange={(e) =>
                        updateDraft(draft.id, "priority", e.target.value as StoryDraft["priority"])
                      }
                      className={`w-full border rounded-lg px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition appearance-none cursor-pointer ${PRIORITY_COLORS[draft.priority]}`}
                    >
                      {(["low", "medium", "high", "critical"] as const).map((p) => (
                        <option key={p} value={p} className="bg-slate-800 text-slate-100 font-normal text-sm">
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Descrição <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft(draft.id, "description", e.target.value)}
                    placeholder="Descreva o contexto, motivação e comportamento esperado…"
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none"
                  />
                </div>

                {/* Acceptance criteria */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Critérios de Aceite <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-col gap-2">
                    {draft.acceptanceCriteria.map((criterion, criterionIndex) => (
                      <div key={criterionIndex} className="flex items-center gap-2">
                        <span className="text-violet-500 text-xs font-mono select-none mt-px">
                          {String(criterionIndex + 1).padStart(2, "0")}
                        </span>
                        <input
                          type="text"
                          value={criterion}
                          onChange={(e) =>
                            updateCriteria(draft.id, criterionIndex, e.target.value)
                          }
                          placeholder="Dado que… quando… então…"
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                        />
                        {draft.acceptanceCriteria.length > 1 && (
                          <button
                            onClick={() => removeCriteria(draft.id, criterionIndex)}
                            className="size-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-950 transition-colors shrink-0"
                          >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addCriteria(draft.id)}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Adicionar critério
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add story button */}
        <button
          onClick={addStory}
          className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 rounded-xl py-3.5 text-sm text-slate-500 hover:text-violet-400 hover:border-violet-700 hover:bg-violet-950/20 transition-all"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Adicionar história
        </button>

        {/* Error */}
        {error && (
          <div className="mt-6 flex items-start gap-3 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3.5 text-sm text-rose-300">
            <svg className="size-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="mt-8 flex items-center justify-between">
          <span className="text-xs text-slate-600">
            {drafts.length} {drafts.length === 1 ? "história" : "histórias"}
          </span>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-sm"
          >
            {isSubmitting ? (
              <>
                <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Iniciando…
              </>
            ) : (
              <>
                Gerar Specs
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
