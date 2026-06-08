export function buildProjectManagerAppCss(): string {
  return `:root {
  color-scheme: light;
  --task-bg: #f5f2ec;
  --task-surface: #fffdf8;
  --task-surface-soft: #ebe7dc;
  --task-ink: #17211c;
  --task-muted: #6d776f;
  --task-accent: #247a62;
  --task-accent-strong: #1a5f4c;
  --task-warning: #b46b18;
  --task-danger: #a84242;
  --task-line: rgba(38, 52, 44, 0.13);
  --task-shadow: 0 24px 70px rgba(50, 42, 29, 0.11);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    linear-gradient(135deg, rgba(36, 122, 98, 0.1), transparent 34%),
    var(--task-bg);
}

.task-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
  gap: clamp(16px, 2vw, 24px);
  padding: clamp(16px, 2vw, 28px);
  color: var(--task-ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.task-intro,
.task-workspace,
.task-topbar article,
.task-item,
.task-empty {
  border: 1px solid var(--task-line);
  background: color-mix(in srgb, var(--task-surface) 94%, white);
  box-shadow: var(--task-shadow);
}

.task-intro {
  position: sticky;
  top: clamp(12px, 2vw, 28px);
  height: calc(100vh - clamp(32px, 4vw, 56px));
  min-height: 680px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-radius: 24px;
  padding: clamp(20px, 3vw, 30px);
}

.task-logo {
  width: 48px;
  height: 48px;
  display: inline-grid;
  place-items: center;
  border-radius: 16px;
  color: white;
  background: var(--task-accent);
  font-size: 1.2rem;
  font-weight: 900;
}

.task-kicker {
  margin: 0 0 8px;
  color: var(--task-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}
h1 {
  margin: 12px 0 10px;
  max-width: 11ch;
  font-size: clamp(2.1rem, 4vw, 3.2rem);
  line-height: 1;
}

.task-summary {
  max-width: 31rem;
  color: var(--task-muted);
  line-height: 1.55;
}

.task-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}

button,
input,
select,
textarea {
  border: 1px solid var(--task-line);
  border-radius: 12px;
  color: inherit;
  background: #fffefa;
  font: inherit;
}

button {
  min-height: 42px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--task-accent) 26%, transparent);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.task-nav button {
  padding: 0 14px;
  color: var(--task-muted);
}

button.is-active,
.task-primary {
  color: white;
  border-color: color-mix(in srgb, var(--task-accent) 70%, black);
  background: var(--task-accent);
}

.task-primary:hover:not(:disabled),
button.is-active:hover {
  background: var(--task-accent-strong);
}

.task-form {
  display: grid;
  gap: 12px;
  margin-top: auto;
}

.task-form label {
  display: grid;
  gap: 7px;
  color: var(--task-muted);
  font-size: 0.86rem;
  font-weight: 800;
}

.task-form input,
.task-form select,
.task-form textarea {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
}

.task-form textarea {
  min-height: 88px;
  resize: vertical;
}

.task-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.task-workspace {
  min-width: 0;
  overflow: hidden;
  border-radius: 26px;
}

.task-topbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: clamp(16px, 2vw, 22px);
  border-bottom: 1px solid var(--task-line);
}

.task-topbar article {
  display: grid;
  gap: 6px;
  border-radius: 18px;
  padding: 16px;
  box-shadow: none;
}

.task-topbar span {
  color: var(--task-muted);
  font-size: 0.9rem;
}

.task-topbar strong {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.task-page {
  padding: clamp(18px, 3vw, 34px);
}

.task-section-head {
  margin-bottom: 20px;
}
.task-section-head h2 {
  margin: 0;
  max-width: 16ch;
  font-size: clamp(1.8rem, 4vw, 3.4rem);
  line-height: 1.03;
  letter-spacing: 0;
}

.task-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.task-filters select {
  min-height: 44px;
  padding: 0 12px;
}

.task-list {
  display: grid;
  gap: 12px;
}

.task-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  border-radius: 18px;
  padding: 16px;
  box-shadow: none;
}

.task-item input[type="checkbox"] {
  width: 22px;
  height: 22px;
  margin-top: 4px;
  accent-color: var(--task-accent);
}

.task-item strong {
  display: block;
  margin-bottom: 5px;
  font-size: 1.02rem;
  overflow-wrap: anywhere;
}

.task-item p {
  margin-bottom: 10px;
  color: var(--task-muted);
  line-height: 1.45;
}

.task-item.is-done strong,
.task-item.is-done p {
  text-decoration: line-through;
}

.task-item.is-overdue {
  border-color: color-mix(in srgb, var(--task-warning) 42%, var(--task-line));
  background: color-mix(in srgb, #fff3df 62%, var(--task-surface));
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-meta span,
.task-meta em {
  border-radius: 999px;
  padding: 5px 9px;
  color: var(--task-muted);
  font-size: 0.76rem;
  font-style: normal;
  font-weight: 800;
  background: var(--task-surface-soft);
}

.task-meta em {
  color: white;
  background: var(--task-accent);
}

.task-item.is-overdue .task-meta em {
  background: var(--task-warning);
}

.task-empty {
  margin: 0;
  border-radius: 18px;
  padding: 28px;
  color: var(--task-muted);
  text-align: center;
  box-shadow: none;
}

@media (max-width: 1040px) {
  .task-shell {
    grid-template-columns: 1fr;
  }

  .task-intro {
    position: static;
    height: auto;
    min-height: auto;
  }
}

@media (max-width: 720px) {
  .task-shell {
    padding: 10px;
  }

  .task-nav,
  .task-topbar,
  .task-form-grid,
  .task-filters {
    grid-template-columns: 1fr;
  }

  h1,
  .task-section-head h2 {
    max-width: none;
  }
}
`;
}
