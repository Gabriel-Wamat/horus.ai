import type {
  CodeContextBundle,
  Spec,
  UserStory,
} from "@u-build/shared";
import type { ProjectWorkspaceContextSnapshot } from "../../project/ProjectExecutionService.js";
import { buildProjectManagerAppCss } from "./frontAgentFallbackCss.js";

export { buildProjectManagerAppCss };

export function buildProjectManagerAppTsx(input: {
  userStory: UserStory;
  spec: Spec;
  codeContext?: CodeContextBundle;
  workspaceContext?: ProjectWorkspaceContextSnapshot;
}): string {
  const productTitle = sanitizeTsString(deriveFallbackProductTitle(input));
  const productIntro = sanitizeTsString(deriveFallbackProductIntro(input));
  const productKicker = sanitizeTsString(deriveFallbackProductKicker(input));
  const logoLetter = sanitizeTsString(deriveFallbackLogoLetter(input));
  const categoryOptions = JSON.stringify(deriveFallbackCategoryOptions(input));
  const exportStyle = detectReactAppExportStyle(input);
  const appDeclaration =
    exportStyle === "default" ? "function App()" : "export function App()";
  const appExport =
    exportStyle === "default" || exportStyle === "both"
      ? "\nexport default App;\n"
      : "\n";

  return `import type { FormEvent } from "react";
import { useMemo, useState } from "react";

type View = "today" | "tasks" | "history";
type TaskStatus = "pending" | "done";
type TaskPriority = "Alta" | "Media" | "Baixa";

interface Task {
  id: number;
  title: string;
  description: string;
  dueAt: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
}

const initialTasks: Task[] = [];

const navItems: Array<{ id: View; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "tasks", label: "Tarefas" },
  { id: "history", label: "Historico" },
];

const statusLabel: Record<TaskStatus, string> = {
  pending: "Pendente",
  done: "Concluida",
};

const priorityOrder: Record<TaskPriority, number> = {
  Alta: 3,
  Media: 2,
  Baixa: 1,
};

const initialCategories = ${categoryOptions};

function nowInputValue() {
  return new Date().toISOString().slice(0, 16);
}

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isOverdue(task: Task) {
  return task.status === "pending" && new Date(task.dueAt).getTime() < Date.now();
}

${appDeclaration} {
  const [activeView, setActiveView] = useState<View>("today");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueAt: nowInputValue(),
    category: "Casa",
    newCategory: "",
    priority: "Media" as TaskPriority,
  });

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => (statusFilter === "all" ? true : task.status === statusFilter))
        .filter((task) => (categoryFilter === "Todas" ? true : task.category === categoryFilter))
        .slice()
        .sort((left, right) => {
          if (left.status !== right.status) return left.status === "pending" ? -1 : 1;
          if (isOverdue(left) !== isOverdue(right)) return isOverdue(left) ? -1 : 1;
          if (priorityOrder[left.priority] !== priorityOrder[right.priority]) {
            return priorityOrder[right.priority] - priorityOrder[left.priority];
          }
          return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
        }),
    [categoryFilter, statusFilter, tasks]
  );

  const metrics = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    const pending = tasks.filter((task) => task.status === "pending").length;
    const overdue = tasks.filter(isOverdue).length;
    return { done, pending, overdue };
  }, [tasks]);

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const resolvedCategory = form.newCategory.trim() || form.category;
    if (form.newCategory.trim() && !categories.includes(form.newCategory.trim())) {
      setCategories((current) => [...current, form.newCategory.trim()]);
    }
    setTasks((current) => [
      {
        id: Date.now(),
        title: form.title.trim(),
        description: form.description.trim(),
        dueAt: form.dueAt,
        category: resolvedCategory,
        priority: form.priority,
        status: "pending",
        completedAt: null,
      },
      ...current,
    ]);
    setForm({
      title: "",
      description: "",
      dueAt: nowInputValue(),
      category: resolvedCategory,
      newCategory: "",
      priority: "Media",
    });
    setActiveView("tasks");
  }

  function toggleTask(taskId: number) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: task.status === "done" ? "pending" : "done",
              completedAt:
                task.status === "done" ? null : new Date().toISOString().slice(0, 16),
            }
          : task
      )
    );
  }

  const completedTasks = tasks.filter((task) => task.status === "done");

  return (
    <main className="task-shell">
      <section className="task-intro" aria-labelledby="app-title">
        <span className="task-logo">${logoLetter}</span>
        <p className="task-kicker">${productKicker}</p>
        <h1 id="app-title">${productTitle}</h1>
        <p className="task-summary">${productIntro}</p>

        <nav className="task-nav" aria-label="Navegacao principal">
          {navItems.map((item) => (
            <button
              className={activeView === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <form className="task-form" onSubmit={createTask}>
          <label>
            Titulo da tarefa
            <input
              aria-required="true"
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Digite o titulo"
              value={form.title}
            />
          </label>
          <label>
            Descricao opcional
            <textarea
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Detalhes opcionais"
              value={form.description}
            />
          </label>
          <div className="task-form-grid">
            <label>
              Vencimento
              <input
                onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                type="datetime-local"
                value={form.dueAt}
              />
            </label>
            <label>
              Prioridade
              <select
                onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}
                value={form.priority}
              >
                <option>Alta</option>
                <option>Media</option>
                <option>Baixa</option>
              </select>
            </label>
          </div>
          <div className="task-form-grid">
            <label>
              Categoria
              <select
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                value={form.category}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Nova categoria
              <input
                onChange={(event) => setForm({ ...form, newCategory: event.target.value })}
                placeholder="Opcional"
                value={form.newCategory}
              />
            </label>
          </div>
          <button className="task-primary" disabled={!form.title.trim()} type="submit">
            Criar tarefa
          </button>
        </form>
      </section>

      <section className="task-workspace">
        <header className="task-topbar">
          <article>
            <span>Pendentes</span>
            <strong>{metrics.pending}</strong>
          </article>
          <article>
            <span>Concluidas</span>
            <strong>{metrics.done}</strong>
          </article>
          <article>
            <span>Atrasadas</span>
            <strong>{metrics.overdue}</strong>
          </article>
        </header>

        {activeView === "today" && (
          <section className="task-page">
            <div className="task-section-head">
              <p className="task-kicker">Prioridade do dia</p>
              <h2>Resolva o que vence primeiro</h2>
            </div>
            <TaskList
              emptyText="Nenhuma tarefa pendente para agora."
              onToggle={toggleTask}
              tasks={visibleTasks.filter((task) => task.status === "pending").slice(0, 4)}
            />
          </section>
        )}

        {activeView === "tasks" && (
          <section className="task-page">
            <div className="task-section-head">
              <p className="task-kicker">Lista principal</p>
              <h2>Tarefas por status e categoria</h2>
            </div>
            <div className="task-filters" aria-label="Filtros de tarefas">
              <select
                aria-label="Filtrar por status"
                onChange={(event) => setStatusFilter(event.target.value as "all" | TaskStatus)}
                value={statusFilter}
              >
                <option value="all">Todos os status</option>
                <option value="pending">Pendentes</option>
                <option value="done">Concluidas</option>
              </select>
              <select
                aria-label="Filtrar por categoria"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              >
                <option>Todas</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
            <TaskList
              emptyText="Nenhuma tarefa encontrada com estes filtros."
              onToggle={toggleTask}
              tasks={visibleTasks}
            />
          </section>
        )}

        {activeView === "history" && (
          <section className="task-page">
            <div className="task-section-head">
              <p className="task-kicker">Historico</p>
              <h2>Concluidas recentemente</h2>
            </div>
            <TaskList
              emptyText="Nenhuma tarefa concluida ainda."
              onToggle={toggleTask}
              tasks={completedTasks}
            />
          </section>
        )}
      </section>
    </main>
  );
}

function TaskList(props: {
  emptyText: string;
  onToggle: (taskId: number) => void;
  tasks: Task[];
}) {
  if (props.tasks.length === 0) {
    return <p className="task-empty">{props.emptyText}</p>;
  }

  return (
    <div className="task-list">
      {props.tasks.map((task) => (
        <article
          className={
            "task-item " +
            (task.status === "done" ? "is-done " : "") +
            (isOverdue(task) ? "is-overdue" : "")
          }
          key={task.id}
        >
          <input
            aria-label={task.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"}
            checked={task.status === "done"}
            onChange={() => props.onToggle(task.id)}
            type="checkbox"
          />
          <div>
            <strong>{task.title}</strong>
            <p>{task.description || "Sem descricao adicional."}</p>
            <div className="task-meta">
              <span>{task.category}</span>
              <span>{task.priority}</span>
              <span>{formatDueAt(task.dueAt)}</span>
              <em>{isOverdue(task) ? "Atrasada" : statusLabel[task.status]}</em>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
${appExport}`;
}

type ReactAppExportStyle = "named" | "default" | "both";

function detectReactAppExportStyle(input: {
  codeContext?: CodeContextBundle;
  workspaceContext?: ProjectWorkspaceContextSnapshot;
}): ReactAppExportStyle {
  const files = [
    ...(input.codeContext?.files ?? []),
    ...(input.workspaceContext?.files ?? []),
  ];
  const main = files.find((file) => file.path === "src/main.tsx")?.content ?? "";
  const app = files.find((file) => file.path === "src/App.tsx")?.content ?? "";

  const importsNamedApp =
    /import\s*\{\s*App\s*\}\s*from\s*["']\.\/App["']/u.test(main) ||
    /import\s*\{\s*App\s*\}\s*from\s*["']\.\/App\.(tsx|ts|jsx|js)["']/u.test(main);
  const importsDefaultApp =
    /import\s+App\s+from\s*["']\.\/App["']/u.test(main) ||
    /import\s+App\s+from\s*["']\.\/App\.(tsx|ts|jsx|js)["']/u.test(main);

  if (importsNamedApp && importsDefaultApp) return "both";
  if (importsNamedApp) return "named";
  if (importsDefaultApp) return "default";

  if (/export\s+function\s+App\b/u.test(app) || /export\s+const\s+App\b/u.test(app)) {
    return "named";
  }
  if (/export\s+default\s+App\b/u.test(app) || /export\s+default\s+function\s+App\b/u.test(app)) {
    return "default";
  }

  return "named";
}

function deriveFallbackProductTitle(input: {
  userStory: UserStory;
  spec: Spec;
}): string {
  const source = buildFallbackSource(input);
  if (containsAny(source, ["tarefa", "tarefas", "pendencia", "pendencias"])) {
    return "Tarefas pessoais";
  }

  const domainLabel = input.userStory.labels.find((label) => {
    const normalized = label.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      !containsAny(normalized, ["legacy", "story", "spec", "horus"])
    );
  });
  if (domainLabel) return titleCaseLabel(domainLabel);

  return "Area de trabalho";
}

function deriveFallbackProductIntro(input: {
  userStory: UserStory;
  spec: Spec;
}): string {
  const source = buildFallbackSource(input);
  if (containsAny(source, ["tarefa", "tarefas", "pendencia", "pendencias"])) {
    return "Crie tarefas, defina vencimento, organize categorias e acompanhe o que ja foi concluido.";
  }
  if (containsAny(source, ["formulario", "cadastro", "crud", "configuracao"])) {
    return "Registre informacoes, valide entradas e acompanhe o estado de cada item em uma interface direta.";
  }
  return "Organize entradas, prioridades e status em uma interface direta para uso diario.";
}

function deriveFallbackProductKicker(input: {
  userStory: UserStory;
  spec: Spec;
}): string {
  const source = buildFallbackSource(input);
  if (containsAny(source, ["tarefa", "tarefas", "pendencia", "pendencias"])) {
    return "Organizacao pessoal";
  }
  if (containsAny(source, ["formulario", "cadastro", "crud", "configuracao"])) {
    return "Fluxo operacional";
  }
  return "Workspace";
}

function deriveFallbackLogoLetter(input: {
  userStory: UserStory;
  spec: Spec;
}): string {
  const title = deriveFallbackProductTitle(input).trim();
  return (title[0] ?? "A").toUpperCase();
}

function deriveFallbackCategoryOptions(input: {
  userStory: UserStory;
  spec: Spec;
}): string[] {
  const source = buildFallbackSource(input);
  if (containsAny(source, ["tarefa", "tarefas", "pendencia", "pendencias"])) {
    return ["Pessoal"];
  }
  return ["Geral"];
}

function buildFallbackSource(input: { userStory: UserStory; spec: Spec }): string {
  return [
    input.userStory.title,
    input.userStory.description,
    ...input.userStory.acceptanceCriteria,
    ...input.userStory.labels,
    input.spec.summary,
    input.spec.technicalApproach,
    ...input.spec.acceptanceCriteria,
    ...input.spec.dataModels,
    ...input.spec.components.flatMap((component) => [
      component.name,
      component.description,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function containsAny(source: string, terms: string[]): boolean {
  return terms.some((term) => source.includes(term));
}

function titleCaseLabel(label: string): string {
  return label
    .split("-")
    .filter((part) => part.length > 0)
    .map(capitalizeAsciiWord)
    .join(" ");
}

function capitalizeAsciiWord(word: string): string {
  if (word.length === 0) return "";
  return `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`;
}

function sanitizeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
