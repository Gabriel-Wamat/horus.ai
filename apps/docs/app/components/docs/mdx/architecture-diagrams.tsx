function DiagramShell({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section className="my-8 rounded-lg border border-[rgba(148,163,184,0.14)] bg-[#14181a] p-4">
      <div className="mb-4 flex flex-col gap-1 border-b border-[rgba(148,163,184,0.14)] pb-3">
        <h3 className="m-0 text-base font-semibold text-[#f1f4f2]">{title}</h3>
        <p className="m-0 text-sm text-[#a4adb3]">{caption}</p>
      </div>
      {children}
    </section>
  )
}

function NodeBox({
  label,
  detail,
  tone = 'neutral',
}: {
  label: string
  detail?: string
  tone?: 'neutral' | 'active' | 'storage' | 'guard'
}) {
  const toneClass = {
    neutral: 'border-[rgba(148,163,184,0.14)] bg-[#181d1f]',
    active: 'border-[rgba(20,199,123,0.32)] bg-[rgba(20,199,123,0.09)]',
    storage: 'border-[rgba(148,163,184,0.22)] bg-[#101415]',
    guard: 'border-[rgba(20,199,123,0.22)] bg-[#0f1314]',
  }[tone]

  return (
    <div className={`min-h-20 rounded-md border p-3 ${toneClass}`}>
      <div className="text-sm font-semibold text-[#f1f4f2]">{label}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-[#a4adb3]">{detail}</div> : null}
    </div>
  )
}

function Arrow() {
  return <div className="hidden text-center text-[#465158] lg:block">→</div>
}

export function SystemArchitectureDiagram() {
  return (
    <DiagramShell
      title="System Architecture"
      caption="Runtime boundaries from browser interaction to persistence and generated project workspaces."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_32px_1.1fr_32px_1.1fr_32px_1fr] lg:items-center">
        <NodeBox label="Web App" detail="React/Vite UI for stories, specs, previews, chat, project files, and run-flow evidence." />
        <Arrow />
        <NodeBox label="Express API" detail="HTTP routes map user intent into application use cases and event streams." />
        <Arrow />
        <NodeBox label="Application + Domain" tone="active" detail="Workflow orchestration, use cases, routing decisions, and approval before apply." />
        <Arrow />
        <NodeBox label="Infrastructure" detail="Agents, LangGraph, repositories, preview runtime, project files, and LLM settings." />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <NodeBox label="Shared Contracts" detail="Zod schemas and entities shared by web, server, and tests." tone="guard" />
        <NodeBox label="Persistence Drivers" detail="File mode under configured runtime root or Postgres-backed repositories." tone="storage" />
        <NodeBox label="Generated Workspaces" detail="Policy-bounded project files, preview commands, and inspectable construction metadata." tone="storage" />
      </div>
    </DiagramShell>
  )
}

export function AgentWorkflowDiagram() {
  const agents = [
    ['User Story', 'Natural-language request and selected workspace context.', 'neutral'],
    ['Spec Agent', 'Turns the story into structured requirements and test expectations.', 'active'],
    ['ODIN', 'Routes work and retry targets from current state and Curator feedback.', 'guard'],
    ['Front + QA', 'Front proposes code operations. QA produces tests and runtime evidence.', 'active'],
    ['Curator', 'Compares spec, code, QA, preview evidence, and quality gates.', 'guard'],
    ['Approved Output', 'Preview, project files, event timeline, and run-flow map.', 'storage'],
  ] as const

  return (
    <DiagramShell
      title="Agent Validation Loop"
      caption="The graph is cyclic by design, but retry limits and checkpoints prevent uncontrolled loops."
    >
      <div className="grid gap-3 lg:grid-cols-6">
        {agents.map(([label, detail, tone]) => (
          <NodeBox key={label} label={label} detail={detail} tone={tone} />
        ))}
      </div>
      <div className="mt-4 rounded-md border border-[rgba(20,199,123,0.24)] bg-[rgba(20,199,123,0.07)] p-3 text-sm text-[#c8ffe8]">
        If Curator fails the result, ODIN routes back to Front, QA, or both while retry budget remains. When the budget is exhausted, the workflow waits for a human checkpoint.
      </div>
    </DiagramShell>
  )
}

export function PrimaryFlowDiagram() {
  return (
    <DiagramShell
      title="Primary Flow"
      caption="ODIN orchestrates parallel specialist work before the Curator validates the result."
    >
      <div className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_32px_1fr_32px_1fr] lg:items-center">
          <NodeBox label="User Story" detail="A user creates or selects a story in the web app." />
          <Arrow />
          <NodeBox label="Spec Agent" tone="active" detail="Turns the story into a technical specification." />
          <Arrow />
          <NodeBox label="ODIN" tone="guard" detail="Routes work, tracks feedback, and decides retry targets." />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr] lg:items-stretch">
          <div className="hidden lg:flex items-center justify-center text-[#465158]">
            <div className="h-px w-full bg-[rgba(148,163,184,0.14)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NodeBox label="Front Agent" tone="active" detail="Proposes scoped frontend/source changes." />
            <NodeBox label="QA Agent" tone="active" detail="Produces validation expectations and evidence." />
          </div>
          <div className="hidden lg:flex items-center justify-center text-[#465158]">
            <div className="h-px w-full bg-[rgba(148,163,184,0.14)]" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_32px_1fr_32px_1fr] lg:items-center">
          <NodeBox label="Fan-in" detail="Implementation proposal and QA evidence merge into one validation context." />
          <Arrow />
          <NodeBox label="Curator" tone="guard" detail="Compares spec, code changes, QA evidence, and runtime evidence." />
          <Arrow />
          <NodeBox label="Approved Output" tone="storage" detail="Preview, project files, run-flow events, and chat surface the result." />
        </div>

        <div className="rounded-md border border-[rgba(20,199,123,0.24)] bg-[rgba(20,199,123,0.07)] p-3 text-sm text-[#c8ffe8]">
          On failure, Curator feedback returns to ODIN, which routes the next iteration to Front, QA, or both.
        </div>
      </div>
    </DiagramShell>
  )
}

export function WorkflowSequenceDiagram() {
  const steps = [
    ['1', 'Start workflow', 'HTTP request creates or resumes a workflow thread.'],
    ['2', 'Persist event', 'Event stream records the transition before agent work continues.'],
    ['3', 'Run graph node', 'LangGraph executes Spec, ODIN, Front, QA, Curator, or checkpoint node.'],
    ['4', 'Write checkpoint', 'File or Postgres checkpointer stores resumable graph state.'],
    ['5', 'Store evidence', 'Code changes, QA output, preview smoke, and Curator result are persisted.'],
    ['6', 'Route decision', 'ODIN completes, retries, or waits for a human checkpoint.'],
  ]

  return (
    <DiagramShell
      title="Workflow Sequence"
      caption="The operational sequence that makes a run resumable and auditable."
    >
      <div className="grid gap-3 lg:grid-cols-6">
        {steps.map(([index, label, detail]) => (
          <div key={index} className="rounded-md border border-[rgba(148,163,184,0.16)] bg-[#181d1f] p-3">
            <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(20,199,123,0.28)] bg-[rgba(20,199,123,0.11)] text-xs font-bold text-[#28e98f]">
              {index}
            </div>
            <div className="text-sm font-semibold text-[#f1f4f2]">{label}</div>
            <div className="mt-1 text-xs leading-5 text-[#a4adb3]">{detail}</div>
          </div>
        ))}
      </div>
    </DiagramShell>
  )
}

export function PersistenceTopologyDiagram() {
  return (
    <DiagramShell
      title="Persistence Topology"
      caption="Repository contracts stay stable while the runtime selects file mode or Postgres mode at startup."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <NodeBox label="createRepositories()" tone="active" detail="Reads runtime config, selects driver, validates writable file roots or initializes database pool." />
        <NodeBox label="File Mode" tone="storage" detail="JSON repositories, file-backed event log, local chat/workspace state, file LangGraph checkpoints." />
        <NodeBox label="Postgres Mode" tone="storage" detail="Database repositories, migrations, durable event log, Postgres LangGraph checkpointer." />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <NodeBox label="Workflow State" detail="Run status, graph state, agent outputs, checkpoints." />
        <NodeBox label="Workspace Artifacts" detail="Folders, stories, specs, and revisions." />
        <NodeBox label="Preview + Events" detail="Session metadata, timelines, SSE replay, run-flow evidence." />
        <NodeBox label="Credentials" tone="guard" detail="Provider secrets stay out of public state and generated artifacts." />
      </div>
    </DiagramShell>
  )
}

export function RepositoryOwnershipDiagram() {
  return (
    <DiagramShell
      title="Repository Ownership"
      caption="Durable state is split by repository contract, not by whichever agent created it."
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <NodeBox label="Workflow + Checkpoints" tone="active" detail="Workflow state repository plus LangGraph checkpointer own run resumability." />
        <NodeBox label="Workspace + Specs" detail="Workspace repository owns folders, user stories, specs, and revisions." />
        <NodeBox label="Chat Memory" detail="Chat repository owns sessions and turn history used by Horus chat." />
        <NodeBox label="Code Change Sets" detail="Code-change repository owns proposed/applied operations and auditability." />
        <NodeBox label="Preview Sessions" detail="Preview repository owns logical state; process handles remain runtime-local." />
        <NodeBox label="Workflow Events" tone="active" detail="Event log owns chronological replay for SSE, run-flow maps, and debugging." />
      </div>
    </DiagramShell>
  )
}

export function PreviewRuntimeDiagram() {
  return (
    <DiagramShell
      title="Preview Runtime Lifecycle"
      caption="Preview sessions persist metadata while process handles stay local to the active server runtime."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_32px_1fr_32px_1fr_32px_1fr] lg:items-center">
        <NodeBox label="Seed Project" detail="Resolve env-driven preview project root, command, route, URL, and package filter." />
        <Arrow />
        <NodeBox label="Create Session" tone="storage" detail="Persist device, route, status, timeline, and project reference." />
        <Arrow />
        <NodeBox label="Start Process" tone="active" detail="Spawn configured preview command through the preview adapter." />
        <Arrow />
        <NodeBox label="Evidence" detail="Record timeline events and smoke validation results for QA/Curator." />
      </div>
      <div className="mt-3 rounded-md border border-[rgba(148,163,184,0.16)] bg-[#101415] p-3 text-sm text-[#c7d0d5]">
        On restart, persisted preview metadata can be recovered, but stale process handles must be treated as stopped and started again intentionally.
      </div>
    </DiagramShell>
  )
}

export function DeploymentTopologyDiagram() {
  return (
    <DiagramShell
      title="Documentation Deployment"
      caption="The docs app is deployed independently from the Horus product runtime."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_32px_1fr_32px_1fr] lg:items-center">
        <NodeBox label="apps/docs" detail="Next.js + Fumadocs/Unmint MDX source, visual identity, and generated docs routes." />
        <Arrow />
        <NodeBox label="Vercel Build" tone="active" detail="Installs docs dependencies, runs Next build, emits static and dynamic documentation routes." />
        <Arrow />
        <NodeBox label="Public Docs URL" tone="storage" detail="Published documentation frontend. It does not require Horus runtime secrets or local state." />
      </div>
    </DiagramShell>
  )
}
