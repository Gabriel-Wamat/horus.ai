import { welcomeContent } from "../data/welcomeContent";
import { formatProjectLabel } from "../../../lib/formatting";

export function WelcomeScreen() {
  return (
    <main className="app-shell">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <p className="eyebrow">{formatProjectLabel(welcomeContent.projectName)}</p>
        <h1 id="welcome-title">{welcomeContent.title}</h1>
        <p className="lede">{welcomeContent.description}</p>
        <div className="action-row" aria-label="Ações do projeto">
          {welcomeContent.actions.map((action) => (
            <button className={`button button--${action.intent}`} key={action.label} type="button">
              <span aria-hidden="true">▣</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
