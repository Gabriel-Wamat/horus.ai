import type { FormEvent } from "react";
import { useMemo, useState, useEffect } from "react";

type View = "home" | "tasks" | "calendar" | "settings";
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
  {
    id: 1001,
    title: "Revisar design da Home",
    owner: "Ana",
    dueDate: "2026-05-10",
    priority: "Alta",
    status: "progress",
  },
  {
    id: 1002,
    title: "Corrigir fluxo de tarefas",
    owner: "Bruno",
    dueDate: "2026-05-15",
    priority: "Media",
    status: "done",
  },
  {
    id: 1003,
    title: "Preparar calendario para revisão",
    owner: "Carla",
    dueDate: "2026-05-27",
    priority: "Baixa",
    status: "pending",
  },
];

const navItems: Array<{ id: View; label: string }> = [
  { id: "home", label: "Home" },
  { id: "tasks", label: "Tarefas" },
  { id: "calendar", label: "Calendario" },
  { id: "settings", label: "Configurações" },
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

export function App() {
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

  const selectedDate = `2026-05-${String(selectedDay).padStart(2, "0")}`;
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedDate);

  return (
    <main className="pm-shell">
      <aside className="pm-sidebar">
        <div>
          <span className="pm-logo">H</span>
          <p className="pm-kicker">Project OS</p>
          <h1>Project Manager</h1>
          <p className="pm-summary">Interface React/TypeScript de gestão de projetos com navegação lateral e três telas: Home (dashboard), Tarefas e Calendário, responsiva e operacional.</p>
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
              <h2>Desempenho Geral</h2>
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
                    <span key={index} style={{ height: `${value}%` }} />
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
                          <em className={`status-${task.status}`}>{statusLabel[task.status]}</em>
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

        {activeView === "settings" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Configurações</p>
              <h2>Preferências</h2>
            </div>

            <div className="pm-panel pm-settings">
              <form className="pm-form" onSubmit={(e) => e.preventDefault()}>
                <label>
                  Tema
                  <select defaultValue="Claro">
                    <option>Claro</option>
                    <option>Escuro</option>
                  </select>
                </label>

                <label className="pm-checkbox">
                  <input type="checkbox" defaultChecked /> Notificações por e-mail
                </label>

                <label>
                  Fuso horário
                  <select defaultValue="America/Sao_Paulo">
                    <option>America/Sao_Paulo</option>
                    <option>UTC</option>
                  </select>
                </label>

                <div className="pm-form-row">
                  <button className="pm-primary" type="button">Salvar</button>
                  <button type="button">Cancelar</button>
                </div>
              </form>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
