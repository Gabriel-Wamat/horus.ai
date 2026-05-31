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
  const title = sanitizeTsString(
    input.userStory.title.replace(/^PM-\d+\s*-\s*/i, "") ||
      "Gerenciamento de projeto"
  );
  const summary = sanitizeTsString(input.spec.summary || input.userStory.description);
  const exportStyle = detectReactAppExportStyle(input);
  const appDeclaration =
    exportStyle === "default" ? "function App()" : "export function App()";
  const appExport =
    exportStyle === "default" || exportStyle === "both"
      ? "\nexport default App;\n"
      : "\n";

  return `import type { FormEvent } from "react";
import { useMemo, useState } from "react";

type View = "home" | "tasks" | "calendar";
type TaskWindow = "day" | "week" | "month";
type TaskStatus = "pending" | "progress" | "done" | "overdue";
type TaskPriority = "Alta" | "Media" | "Baixa";

interface Task {
  id: number;
  title: string;
  owner: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
}

const initialTasks: Task[] = [
  { id: 1, title: "Revisar escopo do dashboard", owner: "Ana", dueDate: "2026-05-27", priority: "Alta", status: "progress" },
  { id: 2, title: "Publicar lista de entregas do dia", owner: "Bruno", dueDate: "2026-05-27", priority: "Media", status: "pending" },
  { id: 3, title: "Validar prototipo mobile", owner: "Clara", dueDate: "2026-05-28", priority: "Alta", status: "done" },
  { id: 4, title: "Ajustar dependencias do calendario", owner: "Davi", dueDate: "2026-05-22", priority: "Baixa", status: "overdue" },
];

const navItems: Array<{ id: View; label: string }> = [
  { id: "home", label: "Home" },
  { id: "tasks", label: "Tarefas" },
  { id: "calendar", label: "Calendario" },
];

const statusLabel: Record<TaskStatus, string> = {
  pending: "Pendente",
  progress: "Em curso",
  done: "Concluida",
  overdue: "Atrasada",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isInWindow(taskDate: string, window: TaskWindow) {
  const today = new Date(todayIso());
  const date = new Date(taskDate);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86400000);

  if (window === "day") return taskDate === todayIso();
  if (window === "week") return diffDays >= -6 && diffDays <= 6;
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

${appDeclaration} {
  const [activeView, setActiveView] = useState<View>("home");
  const [taskWindow, setTaskWindow] = useState<TaskWindow>("day");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedDay, setSelectedDay] = useState(27);
  const [form, setForm] = useState({
    title: "",
    owner: "",
    dueDate: todayIso(),
    priority: "Media" as TaskPriority,
  });

  const visibleTasks = useMemo(
    () => tasks.filter((task) => isInWindow(task.dueDate, taskWindow)),
    [tasks, taskWindow]
  );

  const metrics = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    const overdue = tasks.filter((task) => task.status === "overdue").length;
    const inProgress = tasks.filter((task) => task.status === "progress").length;
    const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return { done, overdue, inProgress, completion };
  }, [tasks]);

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setTasks((current) => [
      {
        id: Date.now(),
        title: form.title.trim(),
        owner: form.owner.trim() || "Sem dono",
        dueDate: form.dueDate,
        priority: form.priority,
        status: "pending",
      },
      ...current,
    ]);
    setForm({ title: "", owner: "", dueDate: todayIso(), priority: "Media" });
  }

  const selectedDate = \`2026-05-\${String(selectedDay).padStart(2, "0")}\`;
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedDate);

  return (
    <main className="pm-shell">
      <aside className="pm-sidebar">
        <div>
          <span className="pm-logo">H</span>
          <p className="pm-kicker">Project OS</p>
          <h1>${title}</h1>
          <p className="pm-summary">${summary}</p>
        </div>
        <nav className="pm-nav" aria-label="Navegacao principal">
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
      </aside>

      <section className="pm-workspace">
        <header className="pm-topbar">
          <div>
            <p className="pm-kicker">Status do projeto</p>
            <strong>{metrics.completion}% concluido</strong>
          </div>
          <div className="pm-live-pill">
            <span />
            Atualizado agora
          </div>
        </header>

        {activeView === "home" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Home</p>
              <h2>Desempenho do projeto</h2>
            </div>

            <div className="pm-metrics">
              <article>
                <span>Concluidas</span>
                <strong>{metrics.done}</strong>
                <small>tarefas fechadas</small>
              </article>
              <article>
                <span>Em progresso</span>
                <strong>{metrics.inProgress}</strong>
                <small>frentes ativas</small>
              </article>
              <article>
                <span>Atrasadas</span>
                <strong>{metrics.overdue}</strong>
                <small>pedem decisao</small>
              </article>
            </div>

            <div className="pm-dashboard-grid">
              <article className="pm-panel pm-chart">
                <div className="pm-section-head compact">
                  <p className="pm-kicker">Semana</p>
                  <h3>Produtividade</h3>
                </div>
                <div className="pm-bars" aria-label="Grafico simples de produtividade semanal">
                  {[42, 58, 64, 72, 54, 81, metrics.completion].map((value, index) => (
                    <span key={index} style={{ height: \`\${value}%\` }} />
                  ))}
                </div>
              </article>

              <article className="pm-panel">
                <div className="pm-section-head compact">
                  <p className="pm-kicker">Marcos</p>
                  <h3>Proximas entregas</h3>
                </div>
                <ul className="pm-timeline">
                  <li><span />Design aprovado para home</li>
                  <li><span />Fluxo diario de tarefas</li>
                  <li><span />Calendario pronto para revisao</li>
                </ul>
              </article>
            </div>
          </section>
        )}

        {activeView === "tasks" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Tarefas</p>
              <h2>Criar e acompanhar listas</h2>
            </div>

            <div className="pm-task-layout">
              <form className="pm-panel pm-form" onSubmit={createTask}>
                <label>
                  Titulo
                  <input
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="Nova tarefa"
                    value={form.title}
                  />
                </label>
                <label>
                  Responsavel
                  <input
                    onChange={(event) => setForm({ ...form, owner: event.target.value })}
                    placeholder="Nome"
                    value={form.owner}
                  />
                </label>
                <div className="pm-form-row">
                  <label>
                    Data
                    <input
                      onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                      type="date"
                      value={form.dueDate}
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
                <button className="pm-primary" type="submit">Criar tarefa</button>
              </form>

              <article className="pm-panel pm-list-panel">
                <div className="pm-filter-tabs" aria-label="Filtro de periodo">
                  {(["day", "week", "month"] as TaskWindow[]).map((item) => (
                    <button
                      className={taskWindow === item ? "is-active" : ""}
                      key={item}
                      onClick={() => setTaskWindow(item)}
                      type="button"
                    >
                      {item === "day" ? "Dia" : item === "week" ? "Semana" : "Mes"}
                    </button>
                  ))}
                </div>
                <div className="pm-task-list">
                  {visibleTasks.length === 0 ? (
                    <p className="pm-empty">Nenhuma tarefa para este periodo.</p>
                  ) : (
                    visibleTasks.map((task) => (
                      <article className="pm-task-item" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>{task.owner} · {task.dueDate}</span>
                        </div>
                        <div className="pm-task-meta">
                          <small>{task.priority}</small>
                          <em className={\`status-\${task.status}\`}>{statusLabel[task.status]}</em>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeView === "calendar" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Calendario</p>
              <h2>Maio 2026</h2>
            </div>
            <div className="pm-calendar-layout">
              <article className="pm-panel pm-calendar">
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <button
                    className={selectedDay === day ? "is-selected" : ""}
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    type="button"
                  >
                    <span>{day}</span>
                    {tasks.some((task) => task.dueDate.endsWith(String(day).padStart(2, "0"))) && <i />}
                  </button>
                ))}
              </article>
              <aside className="pm-panel pm-day-panel">
                <p className="pm-kicker">Dia {selectedDay}</p>
                <h3>Agenda selecionada</h3>
                {selectedTasks.length === 0 ? (
                  <p className="pm-empty">Sem entregas nesse dia.</p>
                ) : (
                  selectedTasks.map((task) => (
                    <article className="pm-day-task" key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{task.owner} · {statusLabel[task.status]}</span>
                    </article>
                  ))
                )}
              </aside>
            </div>
          </section>
        )}
      </section>
    </main>
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

function sanitizeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
