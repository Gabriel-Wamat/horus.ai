# 📘 GUIA COMPLETO DE IMPLEMENTAÇÃO - Sistema Multi-Agente

## 🎯 Objetivo

Este documento ensina **EXATAMENTE** como usar, copiar e implementar cada arquivo do sistema multi-agente do OpenClaude. Escrito de forma rigorosa para que um agente IA possa seguir passo a passo.

---

# 📚 ÍNDICE

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura Detalhada](#2-arquitetura-detalhada)
3. [Dependências e Ordem de Implementação](#3-dependências-e-ordem-de-implementação)
4. [Guia Arquivo por Arquivo](#4-guia-arquivo-por-arquivo)
5. [Fluxos Completos de Execução](#5-fluxos-completos-de-execução)
6. [Exemplos de Implementação](#6-exemplos-de-implementação)
7. [Troubleshooting](#7-troubleshooting)

---

# 1. VISÃO GERAL DO SISTEMA

## 1.1 O que este sistema faz?

O sistema multi-agente permite:
- ✅ Criar múltiplos agentes IA independentes
- ✅ Executar agentes em paralelo ou sequencialmente
- ✅ Compartilhar memória entre agentes
- ✅ Isolar agentes em worktrees Git
- ✅ Executar agentes em background
- ✅ Fork de agentes (clonar com contexto)
- ✅ Comunicação entre agentes (teammates)

## 1.2 Componentes Principais

\`\`\`
┌─────────────────────────────────────────┐
│          CAMADA DE INTERFACE            │
│         (AgentTool.tsx)                 │
│  - Recebe requisições                   │
│  - Valida inputs                        │
│  - Cria tasks                           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      CAMADA DE ORQUESTRAÇÃO             │
│    (LocalAgentTask/)                    │
│  - Gerencia lifecycle                   │
│  - Progress tracking                    │
│  - Cancelamento                         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       CAMADA DE EXECUÇÃO                │
│         (runAgent.ts)                   │
│  - Loop de conversação                  │
│  - Chama LLM (Claude API)               │
│  - Executa tools                        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       CAMADA DE ESTADO                  │
│  (agentMemory.ts + agentContext.ts)     │
│  - Mantém contexto                      │
│  - Persiste memória                     │
│  - Recupera estado                      │
└─────────────────────────────────────────┘
\`\`\`

## 1.3 Fluxo Básico

\`\`\`typescript
1. Usuário → AgentTool.execute({ prompt: "faça algo" })
2. AgentTool → cria LocalAgentTask
3. LocalAgentTask → setup contexto + memória
4. LocalAgentTask → chama runAgent()
5. runAgent → loop:
   a. Chama Claude API
   b. Recebe resposta + tool calls
   c. Executa tools (BashTool, FileEdit, etc.)
   d. Volta para (a) até terminar
6. LocalAgentTask → salva memória
7. Retorna resultado para usuário
\`\`\`

---

# 2. ARQUITETURA DETALHADA

## 2.1 Estrutura de Pastas

\`\`\`
Odin_agentes_idea/
│
├── AgentTool/              ← Interface principal
│   ├── AgentTool.tsx           [CORE] Entry point
│   ├── runAgent.ts             [CORE] Executor principal
│   ├── agentMemory.ts          [CORE] Sistema de memória
│   ├── agentMemorySnapshot.ts  Snapshots de memória
│   ├── forkSubagent.ts         Fork de agentes
│   ├── resumeAgent.ts          Retomar agentes
│   ├── agentToolUtils.ts       Utilitários
│   ├── agentDisplay.ts         UI/Display
│   ├── agentColorManager.ts    Cores
│   ├── builtInAgents.ts        Registro
│   ├── loadAgentsDir.ts        Loader
│   ├── constants.ts            Constantes
│   ├── prompt.ts               Prompts
│   ├── UI.tsx                  React UI
│   └── built-in/               ← Agentes especializados
│       ├── generalPurposeAgent.ts
│       ├── planAgent.ts
│       ├── exploreAgent.ts
│       ├── verificationAgent.ts
│       ├── claudeCodeGuideAgent.ts
│       └── statuslineSetup.ts
│
├── tasks/                  ← Orquestração
│   ├── LocalAgentTask/         [CORE] Task local
│   │   └── LocalAgentTask.tsx      Gerencia lifecycle
│   ├── InProcessTeammateTask/  Multi-agente
│   ├── RemoteAgentTask/        Task remota
│   ├── types.ts                Tipos
│   ├── stopTask.ts             Parar tasks
│   └── pillLabel.ts            UI labels
│
├── utils_agent/            ← Utilitários
│   ├── agentContext.ts         [CORE] Contexto
│   ├── teammate.ts             Multi-agente
│   ├── teammateContext.ts      Contexto de team
│   ├── agentSwarmsEnabled.ts   Feature flags
│   ├── forkedAgent.ts          Fork utilities
│   └── worktree.ts             Git worktrees
│
├── services_agent/         ← Serviços
│   ├── AgentSummary/           Sumarização
│   └── SessionMemory/          Memória persistente
│
├── shared/                 ← Compartilhados
│   ├── gitOperationTracking.ts
│   └── spawnMultiAgent.ts
│
├── core_dependencies/      ← Dependências base
│   ├── Tool.ts                 Base class de tools
│   ├── message.ts              Tipos de mensagem
│   └── ids.ts                  Tipos de IDs
│
└── utils_extras/           ← Utils extras
    ├── messages.ts             Manipulação de mensagens
    ├── systemPrompt.ts         Prompts de sistema
    ├── uuid.ts                 Geração de IDs
    └── sessionStorage.ts       Storage de sessão
\`\`\`

## 2.2 Grafo de Dependências

\`\`\`
AgentTool.tsx
├─── Tool.ts (base class)
├─── LocalAgentTask.tsx
│    ├─── agentContext.ts
│    ├─── agentMemory.ts
│    ├─── runAgent.ts
│    │    ├─── messages.ts
│    │    ├─── systemPrompt.ts
│    │    └─── [Claude API]
│    ├─── SessionMemory/
│    └─── AgentSummary/
│
├─── forkSubagent.ts
│    └─── agentMemory.ts
│
├─── teammate.ts
│    └─── InProcessTeammateTask/
│
└─── builtInAgents.ts
     └─── built-in/*.ts
\`\`\`

---

# 3. DEPENDÊNCIAS E ORDEM DE IMPLEMENTAÇÃO

## 3.1 Ordem Recomendada de Implementação

### **FASE 1: Fundação** (Obrigatório)

1. ✅ \`core_dependencies/Tool.ts\` - Base class
2. ✅ \`core_dependencies/ids.ts\` - Tipos de ID
3. ✅ \`core_dependencies/message.ts\` - Tipos de mensagem
4. ✅ \`utils_extras/uuid.ts\` - Gerador de IDs
5. ✅ \`utils_extras/messages.ts\` - Utils de mensagem

### **FASE 2: Contexto e Memória** (Obrigatório)

6. ✅ \`utils_agent/agentContext.ts\` - Contexto de execução
7. ✅ \`AgentTool/agentMemory.ts\` - Sistema de memória
8. ✅ \`services_agent/SessionMemory/\` - Persistência
9. ✅ \`AgentTool/agentMemorySnapshot.ts\` - Snapshots

### **FASE 3: Execução** (Obrigatório)

10. ✅ \`AgentTool/runAgent.ts\` - Executor principal
11. ✅ \`tasks/LocalAgentTask/LocalAgentTask.tsx\` - Orquestração
12. ✅ \`AgentTool/AgentTool.tsx\` - Interface principal

### **FASE 4: Features Avançadas** (Opcional)

13. ⭐ \`AgentTool/forkSubagent.ts\` - Fork de agentes
14. ⭐ \`AgentTool/resumeAgent.ts\` - Retomar agentes
15. ⭐ \`utils_agent/teammate.ts\` - Multi-agente
16. ⭐ \`tasks/InProcessTeammateTask/\` - Teammates
17. ⭐ \`utils_agent/worktree.ts\` - Isolamento Git

### **FASE 5: Agentes Especializados** (Opcional)

18. 💡 \`AgentTool/built-in/generalPurposeAgent.ts\`
19. 💡 \`AgentTool/built-in/planAgent.ts\`
20. 💡 \`AgentTool/built-in/exploreAgent.ts\`
21. 💡 \`AgentTool/built-in/verificationAgent.ts\`

### **FASE 6: UI e Utils** (Opcional)

22. 🎨 \`AgentTool/UI.tsx\` - Interface React
23. 🎨 \`AgentTool/agentDisplay.ts\` - Display
24. 🎨 \`AgentTool/agentColorManager.ts\` - Cores
25. 🔧 \`AgentTool/agentToolUtils.ts\` - Utilitários

## 3.2 Dependências Externas Necessárias

\`\`\`json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x.x",  // Claude API
    "zod": "^3.x.x",                // Validação
    "react": "^18.x.x",             // UI (opcional)
    "async_hooks": "node:built-in"  // AsyncLocalStorage
  }
}
\`\`\`

---

# 4. GUIA ARQUIVO POR ARQUIVO

## 4.1 CORE: Tool.ts

### **O que faz:**
Base class abstrata para todas as tools (incluindo AgentTool).

### **Interfaces principais:**
\`\`\`typescript
interface ToolDef {
  name: string
  description: () => Promise<string>
  inputSchema: ZodSchema
  outputSchema: ZodSchema
  execute: (input: Input, context: ToolUseContext) => Promise<Output>
  isReadOnly?: () => boolean
  isConcurrencySafe?: () => boolean
}

function buildTool(def: ToolDef): Tool
\`\`\`

### **Como usar:**
\`\`\`typescript
// Toda tool herda desta base
export const MyTool = buildTool({
  name: "MyTool",
  async description() {
    return "Faz algo útil"
  },
  inputSchema: z.object({
    param: z.string()
  }),
  outputSchema: z.object({
    result: z.string()
  }),
  async execute(input, context) {
    // Lógica aqui
    return { result: "done" }
  }
})
\`\`\`

### **Quando implementar:**
✅ Primeiro arquivo - é a fundação de tudo.

### **Dependências:**
- Zod (validação)
- Nenhuma outra dependência interna

---

## 4.2 CORE: agentContext.ts

### **O que faz:**
Gerencia o contexto de execução do agente usando AsyncLocalStorage.

### **Conceito:**
AsyncLocalStorage permite armazenar dados que "seguem" através de chamadas assíncronas.

\`\`\`typescript
// Imagine como thread-local storage, mas para async
const context = new AsyncLocalStorage<AgentContext>()

// Dentro de um agente:
context.run(myContext, async () => {
  // Qualquer função chamada aqui tem acesso a myContext
  const current = context.getStore()
  console.log(current.agentId) // Funciona!
})
\`\`\`

### **Interface principal:**
\`\`\`typescript
interface AgentContext {
  agentId: AgentId
  parentAgentId?: AgentId
  sessionId: string
  workingDirectory: string
  model: string
  permissions: PermissionMode
}

// Funções principais:
function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => Promise<T>
): Promise<T>

function getCurrentAgentContext(): AgentContext | undefined

function getAgentId(): AgentId | undefined
\`\`\`

### **Como usar:**
\`\`\`typescript
// Ao iniciar um agente:
await runWithAgentContext(
  {
    agentId: 'agent-123',
    sessionId: 'session-456',
    workingDirectory: '/projeto',
    model: 'claude-sonnet-4',
    permissions: 'auto'
  },
  async () => {
    // Todo código aqui tem acesso ao contexto
    await runAgent(...)
    
    // Qualquer função profunda pode pegar o contexto:
    const agentId = getAgentId() // 'agent-123'
  }
)
\`\`\`

### **Por que é importante:**
Evita passar \`agentId\` como parâmetro em TODAS as funções. O contexto "viaja" automaticamente.

### **Quando implementar:**
✅ FASE 2 - Antes de implementar memória e execução.

### **Dependências:**
- \`async_hooks\` (Node.js built-in)
- \`ids.ts\` (tipos)

---

## 4.3 CORE: agentMemory.ts

### **O que faz:**
Sistema de memória para agentes. Permite salvar e recuperar o estado/contexto de um agente.

### **Tipos de memória:**

1. **Working Memory** (RAM)
   - Dados temporários durante execução
   - Perdidos ao terminar o agente

2. **Short-term Memory** (Sessão)
   - Dura enquanto sessão está ativa
   - Limpa ao fechar o programa

3. **Long-term Memory** (Disco)
   - Snapshots salvos permanentemente
   - Recuperável em execuções futuras

### **Interface principal:**
\`\`\`typescript
interface AgentMemory {
  agentId: AgentId
  messages: Message[]
  context: Record<string, any>
  snapshots: MemorySnapshot[]
  createdAt: number
  updatedAt: number
}

interface MemorySnapshot {
  id: string
  timestamp: number
  description: string
  state: any
}

// Funções principais:
async function saveAgentMemory(
  agentId: AgentId,
  memory: AgentMemory
): Promise<void>

async function loadAgentMemory(
  agentId: AgentId
): Promise<AgentMemory | null>

async function createMemorySnapshot(
  agentId: AgentId,
  description: string
): Promise<MemorySnapshot>

async function restoreFromSnapshot(
  agentId: AgentId,
  snapshotId: string
): Promise<void>
\`\`\`

### **Como usar:**
\`\`\`typescript
// Ao iniciar agente, tentar carregar memória anterior:
const memory = await loadAgentMemory(agentId)
if (memory) {
  // Agente tem histórico
  messages = memory.messages
  context = memory.context
} else {
  // Agente novo
  messages = []
  context = {}
}

// Durante execução, atualizar memória:
memory.messages.push(newMessage)
memory.context.lastTool = 'BashTool'
await saveAgentMemory(agentId, memory)

// Criar checkpoint:
const snapshot = await createMemorySnapshot(
  agentId,
  "Antes de refatoração grande"
)

// Se algo der errado, voltar:
await restoreFromSnapshot(agentId, snapshot.id)
\`\`\`

### **Estrutura de armazenamento:**
\`\`\`
~/.claude_code/agents/
├── agent-123/
│   ├── memory.json          ← Memória atual
│   ├── snapshots/
│   │   ├── snap-001.json
│   │   └── snap-002.json
│   └── metadata.json
└── agent-456/
    └── ...
\`\`\`

### **Quando implementar:**
✅ FASE 2 - Logo após agentContext.

### **Dependências:**
- \`agentContext.ts\` (contexto atual)
- \`sessionStorage.ts\` (persistência)
- \`ids.ts\` (tipos)

---

## 4.4 CORE: runAgent.ts

### **O que faz:**
O "motor" do agente. Loop principal que conversa com a API Claude e executa tools.

### **Fluxo interno:**
\`\`\`
1. Recebe prompt inicial
2. Loop infinito:
   a. Monta mensagens (histórico + nova)
   b. Chama Claude API
   c. Recebe resposta
   d. Se tem tool_use:
      - Executa tool
      - Adiciona resultado às mensagens
      - Volta para (a)
   e. Se é resposta final:
      - Retorna resultado
      - Sai do loop
3. Salva memória
4. Retorna
\`\`\`

### **Interface principal:**
\`\`\`typescript
interface RunAgentOptions {
  agentId: AgentId
  prompt: string
  messages?: Message[]  // Histórico (se retomando)
  model?: string
  systemPrompt?: string
  tools?: Tool[]
  maxTurns?: number     // Limite de iterações
  onProgress?: (update: ProgressUpdate) => void
  signal?: AbortSignal  // Para cancelamento
}

interface RunAgentResult {
  messages: Message[]
  finalResponse: string
  toolsExecuted: string[]
  tokensUsed: number
}

async function runAgent(
  options: RunAgentOptions
): Promise<RunAgentResult>
\`\`\`

### **Pseudocódigo detalhado:**
\`\`\`typescript
async function runAgent(options) {
  const { agentId, prompt, tools, maxTurns = 100 } = options
  
  // 1. Carregar memória
  const memory = await loadAgentMemory(agentId)
  let messages = memory?.messages || []
  
  // 2. Adicionar prompt do usuário
  messages.push({
    role: 'user',
    content: prompt
  })
  
  // 3. Loop principal
  let turns = 0
  while (turns < maxTurns) {
    turns++
    
    // 4. Chamar Claude API
    const response = await callClaudeAPI({
      model: options.model,
      messages: messages,
      system: options.systemPrompt,
      tools: tools.map(t => t.schema)
    })
    
    // 5. Adicionar resposta às mensagens
    messages.push({
      role: 'assistant',
      content: response.content
    })
    
    // 6. Processar tool calls
    if (response.stop_reason === 'tool_use') {
      const toolCalls = response.content.filter(
        c => c.type === 'tool_use'
      )
      
      for (const toolCall of toolCalls) {
        // 7. Executar tool
        const tool = tools.find(t => t.name === toolCall.name)
        const result = await tool.execute(
          toolCall.input,
          { agentId, messages }
        )
        
        // 8. Adicionar resultado
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          }]
        })
      }
      
      // 9. Continua loop (volta para API)
      continue
    }
    
    // 10. Resposta final
    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
      
      // 11. Salvar memória
      await saveAgentMemory(agentId, {
        messages,
        updatedAt: Date.now()
      })
      
      // 12. Retornar
      return {
        messages,
        finalResponse: finalText,
        toolsExecuted: getToolNames(messages),
        tokensUsed: response.usage.total_tokens
      }
    }
  }
  
  throw new Error('Max turns exceeded')
}
\`\`\`

### **Tratamento de erros:**
\`\`\`typescript
// 1. Timeout de API
try {
  const response = await callClaudeAPI(...)
} catch (err) {
  if (err.code === 'ETIMEDOUT') {
    // Retry com backoff exponencial
    await sleep(2000)
    return runAgent(options)
  }
}

// 2. Rate limiting
if (response.error?.type === 'rate_limit_error') {
  await sleep(response.error.retry_after * 1000)
  return runAgent(options)
}

// 3. Tool execution error
try {
  const result = await tool.execute(...)
} catch (toolError) {
  // Adiciona erro como resultado
  messages.push({
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: toolCall.id,
      content: \`Error: \${toolError.message}\`,
      is_error: true
    }]
  })
  // Continua loop - deixa agente tratar o erro
}
\`\`\`

### **Quando implementar:**
✅ FASE 3 - Após memória estar funcionando.

### **Dependências:**
- \`agentMemory.ts\` (memória)
- \`agentContext.ts\` (contexto)
- \`messages.ts\` (manipulação de mensagens)
- \`systemPrompt.ts\` (prompts)
- Claude API SDK

---

## 4.5 CORE: LocalAgentTask/LocalAgentTask.tsx

### **O que faz:**
Orquestra todo o lifecycle de um agente:
- Setup inicial
- Progress tracking
- Cancelamento
- Cleanup
- Background execution

### **Conceito de Task:**
Uma "Task" é uma unidade de trabalho que pode ser:
- Executada (running)
- Pausada (suspended)
- Cancelada (cancelled)
- Completada (completed)

### **Interface principal:**
\`\`\`typescript
interface AgentTaskOptions {
  agentId: AgentId
  prompt: string
  description: string
  model?: string
  runInBackground?: boolean
  onProgress?: (progress: TaskProgress) => void
  signal?: AbortSignal
}

interface TaskProgress {
  stage: string        // "initializing" | "running" | "completing"
  message: string
  tokensUsed: number
  toolsExecuted: number
  percentComplete?: number
}

class LocalAgentTask {
  constructor(options: AgentTaskOptions)
  
  async start(): Promise<void>
  async wait(): Promise<AgentTaskResult>
  async cancel(): Promise<void>
  getProgress(): TaskProgress
}
\`\`\`

### **Lifecycle completo:**
\`\`\`typescript
class LocalAgentTask {
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  private progress: TaskProgress
  private abortController: AbortController
  
  async start() {
    // 1. Validação
    if (this.status !== 'pending') {
      throw new Error('Task already started')
    }
    
    // 2. Setup contexto
    const context = {
      agentId: this.options.agentId,
      workingDirectory: getCwd(),
      model: this.options.model || 'claude-sonnet-4',
      permissions: 'auto'
    }
    
    // 3. Registrar task (para tracking)
    registerTask(this.options.agentId, this)
    
    // 4. Setup abort controller
    this.abortController = new AbortController()
    
    // 5. Executar em contexto
    this.status = 'running'
    this.updateProgress({ stage: 'initializing', message: 'Starting agent...' })
    
    try {
      await runWithAgentContext(context, async () => {
        // 6. Carregar memória
        const memory = await loadAgentMemory(this.options.agentId)
        
        // 7. Executar agente
        this.updateProgress({ stage: 'running', message: 'Agent executing...' })
        
        const result = await runAgent({
          agentId: this.options.agentId,
          prompt: this.options.prompt,
          messages: memory?.messages,
          signal: this.abortController.signal,
          onProgress: (update) => {
            this.updateProgress({
              stage: 'running',
              message: update.message,
              tokensUsed: update.tokensUsed,
              toolsExecuted: update.toolsExecuted
            })
          }
        })
        
        // 8. Completar
        this.status = 'completed'
        this.result = result
        this.updateProgress({ stage: 'completing', message: 'Done!' })
      })
    } catch (err) {
      // 9. Tratamento de erro
      if (err.name === 'AbortError') {
        this.status = 'cancelled'
      } else {
        this.status = 'failed'
        this.error = err
      }
      throw err
    } finally {
      // 10. Cleanup
      unregisterTask(this.options.agentId)
    }
  }
  
  async wait() {
    // Aguarda completar
    while (this.status === 'running') {
      await sleep(100)
    }
    
    if (this.status === 'completed') {
      return this.result
    }
    
    throw this.error || new Error('Task was cancelled')
  }
  
  async cancel() {
    if (this.status === 'running') {
      this.abortController.abort()
      this.status = 'cancelled'
    }
  }
  
  getProgress() {
    return this.progress
  }
  
  private updateProgress(update: Partial<TaskProgress>) {
    this.progress = { ...this.progress, ...update }
    this.options.onProgress?.(this.progress)
  }
}
\`\`\`

### **Background execution:**
\`\`\`typescript
// Se runInBackground: true
if (options.runInBackground) {
  // Não aguarda - retorna imediatamente
  task.start().catch(err => {
    // Notifica usuário depois
    notifyUser(\`Background task failed: \${err.message}\`)
  })
  
  return {
    taskId: agentId,
    status: 'running',
    message: 'Task running in background'
  }
}

// Se runInBackground: false (padrão)
await task.start()
return await task.wait()
\`\`\`

### **Quando implementar:**
✅ FASE 3 - Junto com runAgent.

### **Dependências:**
- \`runAgent.ts\` (execução)
- \`agentContext.ts\` (contexto)
- \`agentMemory.ts\` (memória)
- \`SessionMemory/\` (persistência)

---

## 4.6 CORE: AgentTool.tsx

### **O que faz:**
Interface pública do sistema. É a "Tool" que o LLM chama para criar agentes.

### **Interface completa:**
\`\`\`typescript
const AgentTool = buildTool({
  name: "AgentTool",
  
  async description() {
    return "Launch a specialized agent to handle complex tasks"
  },
  
  inputSchema: z.object({
    description: z.string()
      .describe('Short 3-5 word description'),
    prompt: z.string()
      .describe('The task for the agent'),
    subagent_type: z.string().optional()
      .describe('Type: generalPurpose, plan, explore, verification'),
    model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
    run_in_background: z.boolean().optional(),
    
    // Multi-agente
    name: z.string().optional()
      .describe('Agent name for SendMessage'),
    team_name: z.string().optional(),
    
    // Isolamento
    isolation: z.enum(['worktree', 'remote']).optional(),
    cwd: z.string().optional(),
    
    // Fork
    resume: z.string().optional()
      .describe('Agent ID to resume, or "self" to fork current')
  }),
  
  outputSchema: z.object({
    agentId: z.string(),
    status: z.string(),
    result: z.string().optional(),
    tokensUsed: z.number().optional()
  }),
  
  async execute(input, context) {
    // 1. Gerar ID
    const agentId = input.resume === 'self' 
      ? forkCurrentAgent()
      : createAgentId()
    
    // 2. Resolver agente especializado
    const agentDef = input.subagent_type
      ? builtInAgents[input.subagent_type]
      : builtInAgents.generalPurpose
    
    // 3. Setup de isolamento
    if (input.isolation === 'worktree') {
      await createAgentWorktree(agentId)
    }
    
    // 4. Criar task
    const task = new LocalAgentTask({
      agentId,
      prompt: input.prompt,
      description: input.description,
      model: input.model,
      runInBackground: input.run_in_background,
      systemPrompt: agentDef.systemPrompt
    })
    
    // 5. Executar
    if (input.run_in_background) {
      task.start()
      return {
        agentId,
        status: 'running',
        message: 'Agent started in background'
      }
    }
    
    await task.start()
    const result = await task.wait()
    
    // 6. Cleanup de isolamento
    if (input.isolation === 'worktree') {
      await removeAgentWorktree(agentId)
    }
    
    // 7. Retornar
    return {
      agentId,
      status: 'completed',
      result: result.finalResponse,
      tokensUsed: result.tokensUsed
    }
  }
})
\`\`\`

### **Quando implementar:**
✅ FASE 3 - Último arquivo da fase obrigatória.

### **Dependências:**
- \`Tool.ts\` (base)
- \`LocalAgentTask\` (orquestração)
- \`builtInAgents\` (registro)
- \`forkSubagent\` (se usar fork)
- \`worktree\` (se usar isolamento)

---

## 4.7 AVANÇADO: forkSubagent.ts

### **O que faz:**
Permite "clonar" um agente atual com TODO o contexto (mensagens, memória, working directory).

### **Caso de uso:**
\`\`\`
Agente A está trabalhando numa tarefa
→ Precisa tentar 2 abordagens diferentes
→ Fork: cria Agente B com cópia do contexto de A
→ Agente B tenta abordagem alternativa
→ Se der certo, usa; se não, descarta
\`\`\`

### **Interface:**
\`\`\`typescript
interface ForkOptions {
  sourceAgentId: AgentId
  newPrompt: string
  description: string
}

interface ForkedAgentContext {
  agentId: AgentId
  messages: Message[]     // Copiadas do original
  memory: AgentMemory     // Clonada
  workingDirectory: string // Mesma
}

async function forkSubagent(
  options: ForkOptions
): Promise<ForkedAgentContext>
\`\`\`

### **Implementação:**
\`\`\`typescript
async function forkSubagent(options: ForkOptions) {
  // 1. Carregar contexto original
  const sourceMemory = await loadAgentMemory(options.sourceAgentId)
  if (!sourceMemory) {
    throw new Error('Cannot fork - source agent has no memory')
  }
  
  // 2. Criar novo ID
  const newAgentId = createAgentId()
  
  // 3. Clonar memória
  const clonedMemory: AgentMemory = {
    agentId: newAgentId,
    messages: [...sourceMemory.messages],  // Deep copy
    context: { ...sourceMemory.context },
    snapshots: [],  // Não copia snapshots
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentAgentId: options.sourceAgentId  // Referência ao pai
  }
  
  // 4. Salvar memória clonada
  await saveAgentMemory(newAgentId, clonedMemory)
  
  // 5. Retornar contexto
  return {
    agentId: newAgentId,
    messages: clonedMemory.messages,
    memory: clonedMemory,
    workingDirectory: getCurrentWorkingDirectory()
  }
}
\`\`\`

### **Como usar no AgentTool:**
\`\`\`typescript
// No execute() do AgentTool:
if (input.resume === 'self') {
  const currentAgentId = getAgentId()  // Do contexto
  const forked = await forkSubagent({
    sourceAgentId: currentAgentId,
    newPrompt: input.prompt,
    description: input.description
  })
  
  // Usar o ID forked
  agentId = forked.agentId
  initialMessages = forked.messages
}
\`\`\`

### **Quando implementar:**
⭐ FASE 4 - Depois do básico funcionar.

### **Dependências:**
- \`agentMemory.ts\`
- \`agentContext.ts\`

---

## 4.8 AVANÇADO: teammate.ts + InProcessTeammateTask

### **O que faz:**
Sistema de multi-agente onde vários agentes trabalham juntos como um "time".

### **Conceitos:**

**Teammate** = Agente que faz parte de um time
- Tem um nome
- Pode enviar/receber mensagens de outros teammates
- Compartilha contexto de time

### **Casos de uso:**
\`\`\`
Cenário 1: Divisão de trabalho
- Backend Agent: Implementa API
- Frontend Agent: Implementa UI
- Test Agent: Escreve testes
→ Coordenação via mensagens

Cenário 2: Revisão
- Dev Agent: Escreve código
- Review Agent: Revisa e sugere melhorias
→ Interação iterativa
\`\`\`

### **Interface:**
\`\`\`typescript
interface TeammateOptions {
  name: string          // Nome único no time
  teamName: string      // Nome do time
  role?: string         // backend | frontend | reviewer
  initialPrompt: string
}

interface TeamContext {
  teamName: string
  members: Map<string, AgentId>
  sharedMemory: Record<string, any>
  messageQueue: TeamMessage[]
}

interface TeamMessage {
  from: string          // Nome do sender
  to: string           // Nome do receiver, ou "all"
  content: string
  timestamp: number
}

// Funções principais:
async function spawnTeammate(
  options: TeammateOptions
): Promise<AgentId>

async function sendTeamMessage(
  from: string,
  to: string,
  message: string
): Promise<void>

async function getTeamMessages(
  teammateN: string
): Promise<TeamMessage[]>
\`\`\`

### **Implementação de InProcessTeammateTask:**
\`\`\`typescript
class InProcessTeammateTask extends LocalAgentTask {
  private teamName: string
  private memberName: string
  
  constructor(options: TeammateOptions) {
    super({
      agentId: createAgentId(),
      prompt: options.initialPrompt,
      description: \`Teammate: \${options.name}\`
    })
    
    this.teamName = options.teamName
    this.memberName = options.name
    
    // Registrar no time
    registerTeammate(this.teamName, this.memberName, this.agentId)
  }
  
  async start() {
    // Setup adicional de time
    await runWithTeamContext({
      teamName: this.teamName,
      memberName: this.memberName
    }, async () => {
      // Executa como agente normal
      await super.start()
      
      // Loop de mensagens
      await this.messageLoop()
    })
  }
  
  private async messageLoop() {
    while (this.status === 'running') {
      // Checar mensagens novas
      const messages = await getTeamMessages(this.memberName)
      
      for (const msg of messages) {
        if (msg.to === this.memberName || msg.to === 'all') {
          // Processar mensagem
          await this.handleTeamMessage(msg)
        }
      }
      
      await sleep(1000)  // Poll a cada 1s
    }
  }
  
  private async handleTeamMessage(msg: TeamMessage) {
    // Adiciona mensagem ao contexto do agente
    const memory = await loadAgentMemory(this.agentId)
    memory.messages.push({
      role: 'user',
      content: \`[Message from \${msg.from}]: \${msg.content}\`
    })
    
    // Agente pode responder usando SendMessageTool
  }
}
\`\`\`

### **Como usar:**
\`\`\`typescript
// 1. Criar time
const backendAgent = await spawnTeammate({
  name: 'backend',
  teamName: 'dev_team',
  role: 'backend',
  initialPrompt: 'Implement the REST API'
})

const frontendAgent = await spawnTeammate({
  name: 'frontend',
  teamName: 'dev_team',
  role: 'frontend',
  initialPrompt: 'Create the UI'
})

// 2. Agentes podem se comunicar via SendMessageTool
// Backend agent usa:
{
  tool: "SendMessageTool",
  input: {
    to: "frontend",
    message: "API endpoints are ready at /api/users"
  }
}

// Frontend agent recebe e pode responder:
{
  tool: "SendMessageTool",
  input: {
    to: "backend",
    message: "Thanks! UI is consuming the endpoints now"
  }
}

// 3. Broadcast para todos:
{
  tool: "SendMessageTool",
  input: {
    to: "all",
    message: "Deploy is ready, everyone please test"
  }
}
\`\`\`

### **Estrutura de armazenamento:**
\`\`\`
~/.claude_code/teams/
├── dev_team/
│   ├── members.json      ← { backend: agent-123, frontend: agent-456 }
│   ├── messages.json     ← Array de TeamMessage
│   └── shared_memory.json
└── qa_team/
    └── ...
\`\`\`

### **Quando implementar:**
⭐ FASE 4 - Recurso avançado.

### **Dependências:**
- \`LocalAgentTask\`
- \`agentMemory.ts\`
- \`SendMessageTool\` (nova tool necessária)

---

## 4.9 AVANÇADO: worktree.ts

### **O que faz:**
Isolamento Git usando worktrees. Permite agente trabalhar em branch temporário sem afetar branch principal.

### **Conceito de Worktree:**
\`\`\`
projeto/                  ← Branch main
├── src/
└── ...

projeto-worktree-agent-123/  ← Branch temp: agent/agent-123
├── src/              ← Cópia do código
└── ...               ← Agente trabalha aqui
\`\`\`

Mudanças no worktree não afetam \`projeto/\`. Fácil descartar ou mergear depois.

### **Interface:**
\`\`\`typescript
interface WorktreeOptions {
  agentId: AgentId
  baseBranch?: string  // Default: current branch
  branchName?: string  // Default: agent/{agentId}
}

async function createAgentWorktree(
  agentId: AgentId,
  options?: WorktreeOptions
): Promise<string>  // Retorna path do worktree

async function removeAgentWorktree(
  agentId: AgentId
): Promise<void>

async function hasWorktreeChanges(
  agentId: AgentId
): Promise<boolean>

async function mergeWorktreeToMain(
  agentId: AgentId,
  message: string
): Promise<void>
\`\`\`

### **Implementação:**
\`\`\`typescript
async function createAgentWorktree(agentId: AgentId, options = {}) {
  const projectRoot = getCwd()
  const branchName = options.branchName || \`agent/\${agentId}\`
  const worktreePath = \`\${projectRoot}-worktree-\${agentId}\`
  
  // 1. Criar branch
  await exec(\`git branch \${branchName}\`)
  
  // 2. Criar worktree
  await exec(
    \`git worktree add \${worktreePath} \${branchName}\`
  )
  
  // 3. Registrar
  registerWorktree(agentId, worktreePath)
  
  return worktreePath
}

async function removeAgentWorktree(agentId: AgentId) {
  const worktreePath = getWorktreePath(agentId)
  
  if (!worktreePath) {
    return  // Já foi removido
  }
  
  // 1. Checar se tem mudanças
  const hasChanges = await hasWorktreeChanges(agentId)
  
  if (hasChanges) {
    // Avisar usuário
    console.warn(
      \`Worktree \${agentId} has uncommitted changes. They will be lost.\`
    )
  }
  
  // 2. Remover worktree
  await exec(\`git worktree remove \${worktreePath} --force\`)
  
  // 3. Deletar branch
  const branchName = \`agent/\${agentId}\`
  await exec(\`git branch -D \${branchName}\`)
  
  // 4. Desregistrar
  unregisterWorktree(agentId)
}

async function hasWorktreeChanges(agentId: AgentId) {
  const worktreePath = getWorktreePath(agentId)
  
  // Checar git status
  const result = await exec(
    \`git -C \${worktreePath} status --porcelain\`
  )
  
  return result.stdout.trim().length > 0
}

async function mergeWorktreeToMain(agentId: AgentId, message: string) {
  const worktreePath = getWorktreePath(agentId)
  const branchName = \`agent/\${agentId}\`
  
  // 1. Commit mudanças no worktree
  await exec(\`git -C \${worktreePath} add -A\`)
  await exec(\`git -C \${worktreePath} commit -m "\${message}"\`)
  
  // 2. Voltar para main
  const projectRoot = getCwd()
  process.chdir(projectRoot)
  
  // 3. Merge
  await exec(\`git merge \${branchName}\`)
  
  // 4. Cleanup
  await removeAgentWorktree(agentId)
}
\`\`\`

### **Como usar no AgentTool:**
\`\`\`typescript
// No execute():
if (input.isolation === 'worktree') {
  // 1. Criar worktree
  const worktreePath = await createAgentWorktree(agentId)
  
  // 2. Mudar working directory do agente
  const task = new LocalAgentTask({
    agentId,
    prompt: input.prompt,
    cwd: worktreePath  // ← Agente trabalha no worktree
  })
  
  try {
    await task.start()
    const result = await task.wait()
    
    // 3. Perguntar se quer mergear
    const shouldMerge = await askUser(
      'Agent completed. Merge changes to main?'
    )
    
    if (shouldMerge) {
      await mergeWorktreeToMain(
        agentId,
        \`Agent \${input.description}: \${input.prompt}\`
      )
    } else {
      await removeAgentWorktree(agentId)
    }
    
    return result
  } catch (err) {
    // 4. Cleanup em caso de erro
    await removeAgentWorktree(agentId)
    throw err
  }
}
\`\`\`

### **Quando implementar:**
⭐ FASE 4 - Recurso avançado de isolamento.

### **Dependências:**
- Git instalado
- \`BashTool\` ou exec function
- \`agentContext.ts\` (para cwd)

---

# 5. FLUXOS COMPLETOS DE EXECUÇÃO

## 5.1 Fluxo: Agente Simples

\`\`\`
USER
  │
  │ "AgentTool.execute({ prompt: 'Fix bug in app.ts' })"
  ▼
AgentTool.tsx
  │ 1. Gera agentId
  │ 2. Cria LocalAgentTask
  ▼
LocalAgentTask.start()
  │ 3. Setup agentContext
  │ 4. Carrega agentMemory (vazio se novo)
  │ 5. Chama runAgent()
  ▼
runAgent()
  │ 6. messages = [{ role: 'user', content: 'Fix bug in app.ts' }]
  │ 7. Loop:
  │    a. callClaudeAPI(messages)
  │    b. Recebe: "I'll read the file first"
  │    c. Tool call: FileReadTool({ path: 'app.ts' })
  │    d. Executa FileReadTool
  │    e. messages.push({ role: 'user', tool_result: '...' })
  │    f. callClaudeAPI(messages) novamente
  │    g. Recebe: "Found bug on line 42"
  │    h. Tool call: FileEditTool({ path: 'app.ts', ... })
  │    i. Executa FileEditTool
  │    j. messages.push({ role: 'user', tool_result: 'success' })
  │    k. callClaudeAPI(messages) novamente
  │    l. Recebe resposta final: "Bug fixed!"
  │ 8. Retorna { messages, finalResponse, ... }
  ▼
LocalAgentTask
  │ 9. Salva agentMemory
  │ 10. status = 'completed'
  ▼
AgentTool
  │ 11. Retorna resultado
  ▼
USER recebe: "Bug fixed!"
\`\`\`

---

## 5.2 Fluxo: Fork de Agente

\`\`\`
AGENT A (em execução)
  │ Trabalhando em refatoração
  │ Quer tentar abordagem alternativa
  │
  │ "AgentTool.execute({ resume: 'self', prompt: 'Try alternative approach' })"
  ▼
AgentTool.tsx
  │ 1. Detecta resume: 'self'
  │ 2. Pega agentId atual do contexto
  │ 3. Chama forkSubagent()
  ▼
forkSubagent()
  │ 4. Carrega memória de AGENT A
  │ 5. Clona todas as mensagens
  │ 6. Gera novo agentId para AGENT B
  │ 7. Salva memória clonada com novo ID
  │ 8. Retorna contexto forked
  ▼
AgentTool.tsx
  │ 9. Cria LocalAgentTask para AGENT B
  │ 10. initialMessages = mensagens clonadas de A
  ▼
LocalAgentTask (AGENT B)
  │ 11. Inicia com histórico de A
  │ 12. Adiciona novo prompt
  │ 13. runAgent() com contexto herdado
  ▼
runAgent() (AGENT B)
  │ 14. Tem TODO o conhecimento de A
  │ 15. Tenta abordagem alternativa
  │ 16. Retorna resultado
  ▼
AGENT A
  │ 17. Recebe resultado de B
  │ 18. Decide qual abordagem usar
\`\`\`

---

## 5.3 Fluxo: Multi-Agente (Teammates)

\`\`\`
USER
  │ "Create a team: backend + frontend"
  │
  ├─ AgentTool.execute({ name: 'backend', team_name: 'dev', ... })
  │   │
  │   ▼
  │  InProcessTeammateTask ('backend')
  │   │ - agentId: agent-123
  │   │ - Registrado no time 'dev'
  │   │ - Inicia messageLoop()
  │   │
  │   └─ runAgent()
  │       │ Implementa API
  │       │ Usa SendMessageTool({ to: 'frontend', msg: '...' })
  │       │
  │       └─ Mensagem adicionada à fila do time
  │
  └─ AgentTool.execute({ name: 'frontend', team_name: 'dev', ... })
      │
      ▼
     InProcessTeammateTask ('frontend')
      │ - agentId: agent-456
      │ - Registrado no mesmo time 'dev'
      │ - messageLoop() detecta mensagem de 'backend'
      │
      └─ handleTeamMessage()
          │ Adiciona mensagem ao contexto
          │ runAgent() continua com essa info
          │ Cria UI consumindo API
          │
          └─ SendMessageTool({ to: 'backend', msg: 'UI ready' })
              │
              └─ 'backend' recebe e continua

Coordenação automática via mensagens!
\`\`\`

---

## 5.4 Fluxo: Isolamento com Worktree

\`\`\`
USER
  │ "AgentTool.execute({ prompt: '...', isolation: 'worktree' })"
  ▼
AgentTool.tsx
  │ 1. Detecta isolation: 'worktree'
  │ 2. Chama createAgentWorktree()
  ▼
worktree.ts
  │ 3. git branch agent/agent-123
  │ 4. git worktree add /proj-worktree-123 agent/agent-123
  │ 5. Retorna worktreePath
  ▼
AgentTool.tsx
  │ 6. Cria LocalAgentTask
  │ 7. cwd = worktreePath  ← Agente trabalha no worktree
  ▼
LocalAgentTask
  │ 8. Setup contexto com cwd do worktree
  │ 9. runAgent() executa no worktree
  ▼
runAgent()
  │ 10. Todas as tools usam worktree como cwd
  │ 11. BashTool executa comandos no worktree
  │ 12. FileEditTool edita arquivos no worktree
  │ 13. Branch main NUNCA é afetado
  │ 14. Termina
  ▼
AgentTool.tsx
  │ 15. hasWorktreeChanges()? → Sim
  │ 16. Pergunta usuário: "Merge to main?"
  │
  ├─ Se SIM:
  │   │ mergeWorktreeToMain()
  │   │ - git commit no worktree
  │   │ - git merge agent/agent-123
  │   │ - Mudanças vão para main
  │   └─ removeAgentWorktree()
  │
  └─ Se NÃO:
      │ removeAgentWorktree()
      │ - Descarta todas as mudanças
      └─ Main fica intacto
\`\`\`

---

# 6. EXEMPLOS DE IMPLEMENTAÇÃO

## 6.1 Implementação Mínima Funcional

\`\`\`typescript
// ============================================
// FASE 1: Setup Básico (30 minutos)
// ============================================

// 1. Instalar dependências
npm install @anthropic-ai/sdk zod

// 2. Criar estrutura
mkdir -p src/{core,tasks,utils}

// 3. Copiar arquivos essenciais:
// - core/Tool.ts
// - core/ids.ts
// - core/message.ts
// - utils/uuid.ts
// - utils/messages.ts

// ============================================
// FASE 2: Contexto e Memória (1 hora)
// ============================================

// 4. Implementar agentContext.ts
import { AsyncLocalStorage } from 'async_hooks'

const agentContextStorage = new AsyncLocalStorage<AgentContext>()

export function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => Promise<T>
): Promise<T> {
  return agentContextStorage.run(context, fn)
}

export function getAgentId(): AgentId | undefined {
  return agentContextStorage.getStore()?.agentId
}

// 5. Implementar agentMemory.ts
import fs from 'fs/promises'
import path from 'path'

const MEMORY_DIR = path.join(os.homedir(), '.my_agents')

export async function saveAgentMemory(
  agentId: AgentId,
  memory: AgentMemory
): Promise<void> {
  const dir = path.join(MEMORY_DIR, agentId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'memory.json'),
    JSON.stringify(memory, null, 2)
  )
}

export async function loadAgentMemory(
  agentId: AgentId
): Promise<AgentMemory | null> {
  try {
    const data = await fs.readFile(
      path.join(MEMORY_DIR, agentId, 'memory.json'),
      'utf-8'
    )
    return JSON.parse(data)
  } catch {
    return null
  }
}

// ============================================
// FASE 3: Execução (2 horas)
// ============================================

// 6. Implementar runAgent.ts
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function runAgent(options: RunAgentOptions) {
  const { agentId, prompt, model = 'claude-sonnet-4-20250514' } = options
  
  // Carregar memória
  const memory = await loadAgentMemory(agentId)
  let messages = memory?.messages || []
  
  // Adicionar prompt
  messages.push({
    role: 'user',
    content: prompt
  })
  
  // Loop principal
  let maxTurns = 50
  while (maxTurns-- > 0) {
    // Chamar API
    const response = await claude.messages.create({
      model,
      max_tokens: 4096,
      messages,
      tools: options.tools?.map(t => ({
        name: t.name,
        description: await t.description(),
        input_schema: t.inputSchema
      }))
    })
    
    // Adicionar resposta
    messages.push({
      role: 'assistant',
      content: response.content
    })
    
    // Processar tool calls
    if (response.stop_reason === 'tool_use') {
      const toolResults = []
      
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const tool = options.tools.find(t => t.name === block.name)
          
          try {
            const result = await tool.execute(block.input, { agentId })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            })
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: \`Error: \${err.message}\`,
              is_error: true
            })
          }
        }
      }
      
      messages.push({
        role: 'user',
        content: toolResults
      })
      
      continue // Volta para API
    }
    
    // Resposta final
    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
      
      // Salvar memória
      await saveAgentMemory(agentId, {
        agentId,
        messages,
        updatedAt: Date.now()
      })
      
      return {
        messages,
        finalResponse: finalText,
        tokensUsed: response.usage.total_tokens
      }
    }
  }
  
  throw new Error('Max turns exceeded')
}

// 7. Implementar LocalAgentTask (simplificado)
export class LocalAgentTask {
  private agentId: AgentId
  private options: AgentTaskOptions
  private result: any
  
  constructor(options: AgentTaskOptions) {
    this.agentId = options.agentId
    this.options = options
  }
  
  async start() {
    const context = {
      agentId: this.agentId,
      workingDirectory: process.cwd(),
      model: this.options.model || 'claude-sonnet-4-20250514'
    }
    
    await runWithAgentContext(context, async () => {
      this.result = await runAgent({
        agentId: this.agentId,
        prompt: this.options.prompt,
        tools: this.options.tools || []
      })
    })
  }
  
  async wait() {
    return this.result
  }
}

// 8. Implementar AgentTool
import { buildTool } from './core/Tool'
import { z } from 'zod'

export const AgentTool = buildTool({
  name: "AgentTool",
  
  async description() {
    return "Launch an agent to handle tasks"
  },
  
  inputSchema: z.object({
    description: z.string(),
    prompt: z.string(),
    model: z.string().optional()
  }),
  
  outputSchema: z.object({
    agentId: z.string(),
    result: z.string()
  }),
  
  async execute(input) {
    const agentId = generateUUID()
    
    const task = new LocalAgentTask({
      agentId,
      prompt: input.prompt,
      model: input.model,
      tools: [
        // Adicione suas tools aqui
        // BashTool, FileReadTool, FileEditTool, etc.
      ]
    })
    
    await task.start()
    const result = await task.wait()
    
    return {
      agentId,
      result: result.finalResponse
    }
  }
})

// ============================================
// PRONTO! Sistema básico funcionando
// ============================================

// Usar:
const result = await AgentTool.execute({
  description: "Fix bug",
  prompt: "Find and fix the bug in app.ts"
})

console.log(result.result)
\`\`\`

---

## 6.2 Adicionando Fork de Agente

\`\`\`typescript
// Depois de implementar o básico:

// 1. Implementar forkSubagent.ts
export async function forkSubagent(sourceAgentId: AgentId) {
  const sourceMemory = await loadAgentMemory(sourceAgentId)
  if (!sourceMemory) {
    throw new Error('No memory to fork')
  }
  
  const newAgentId = generateUUID()
  
  const clonedMemory = {
    agentId: newAgentId,
    messages: JSON.parse(JSON.stringify(sourceMemory.messages)),
    context: { ...sourceMemory.context },
    parentAgentId: sourceAgentId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  await saveAgentMemory(newAgentId, clonedMemory)
  
  return {
    agentId: newAgentId,
    messages: clonedMemory.messages
  }
}

// 2. Atualizar AgentTool
inputSchema: z.object({
  description: z.string(),
  prompt: z.string(),
  resume: z.string().optional()  // ← Novo campo
}),

async execute(input) {
  let agentId: AgentId
  let initialMessages: Message[] = []
  
  if (input.resume === 'self') {
    // Fork do agente atual
    const currentAgentId = getAgentId()
    if (!currentAgentId) {
      throw new Error('Cannot fork - no current agent')
    }
    
    const forked = await forkSubagent(currentAgentId)
    agentId = forked.agentId
    initialMessages = forked.messages
  } else {
    // Agente novo
    agentId = generateUUID()
  }
  
  const task = new LocalAgentTask({
    agentId,
    prompt: input.prompt,
    initialMessages  // ← Passa mensagens clonadas
  })
  
  // ... resto igual
}

// 3. Usar:
// Agente A está executando:
const resultB = await AgentTool.execute({
  description: "Alternative approach",
  prompt: "Try different solution",
  resume: "self"  // ← Fork
})
// Agente B tem todo contexto de A!
\`\`\`

---

## 6.3 Adicionando Worktree Isolation

\`\`\`typescript
// 1. Implementar worktree.ts
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function createAgentWorktree(agentId: AgentId) {
  const projectRoot = process.cwd()
  const branchName = \`agent/\${agentId}\`
  const worktreePath = \`\${projectRoot}-worktree-\${agentId}\`
  
  // Criar branch
  await execAsync(\`git branch \${branchName}\`)
  
  // Criar worktree
  await execAsync(\`git worktree add \${worktreePath} \${branchName}\`)
  
  return worktreePath
}

export async function removeAgentWorktree(agentId: AgentId) {
  const projectRoot = process.cwd()
  const worktreePath = \`\${projectRoot}-worktree-\${agentId}\`
  const branchName = \`agent/\${agentId}\`
  
  await execAsync(\`git worktree remove \${worktreePath} --force\`)
  await execAsync(\`git branch -D \${branchName}\`)
}

// 2. Atualizar AgentTool
inputSchema: z.object({
  // ... campos existentes
  isolation: z.enum(['worktree']).optional()
}),

async execute(input) {
  const agentId = generateUUID()
  let worktreePath: string | undefined
  
  try {
    // Setup worktree
    if (input.isolation === 'worktree') {
      worktreePath = await createAgentWorktree(agentId)
    }
    
    const task = new LocalAgentTask({
      agentId,
      prompt: input.prompt,
      cwd: worktreePath || process.cwd()  // ← Usa worktree
    })
    
    await task.start()
    const result = await task.wait()
    
    // Cleanup
    if (worktreePath) {
      await removeAgentWorktree(agentId)
    }
    
    return result
  } catch (err) {
    // Cleanup em caso de erro
    if (worktreePath) {
      await removeAgentWorktree(agentId)
    }
    throw err
  }
}

// 3. Usar:
const result = await AgentTool.execute({
  description: "Refactor code",
  prompt: "Refactor without breaking main",
  isolation: "worktree"  // ← Isolado!
})
\`\`\`

---

# 7. TROUBLESHOOTING

## 7.1 Erros Comuns

### **Erro: "Cannot read agentId from context"**

**Causa**: Código está fora do \`runWithAgentContext\`.

**Solução**:
\`\`\`typescript
// ❌ ERRADO:
const agentId = getAgentId()
await runAgent(...)

// ✅ CERTO:
await runWithAgentContext(context, async () => {
  const agentId = getAgentId()  // Agora funciona
  await runAgent(...)
})
\`\`\`

---

### **Erro: "Memory file not found"**

**Causa**: Agente nunca teve memória salva.

**Solução**:
\`\`\`typescript
const memory = await loadAgentMemory(agentId)
if (!memory) {
  // Criar memória vazia
  memory = {
    agentId,
    messages: [],
    context: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  await saveAgentMemory(agentId, memory)
}
\`\`\`

---

### **Erro: "Max turns exceeded"**

**Causa**: Loop infinito - agente não consegue completar.

**Solução**:
\`\`\`typescript
// Aumentar limite:
const result = await runAgent({
  agentId,
  prompt,
  maxTurns: 100  // Default: 50
})

// Ou adicionar detecção de loop:
let lastResponse = ''
let sameResponseCount = 0

if (finalText === lastResponse) {
  sameResponseCount++
  if (sameResponseCount >= 3) {
    throw new Error('Agent stuck in loop')
  }
} else {
  sameResponseCount = 0
}
lastResponse = finalText
\`\`\`

---

### **Erro: "Tool execution failed"**

**Causa**: Tool retornou erro.

**Solução**:
\`\`\`typescript
// Não falhar - deixar agente lidar:
try {
  const result = await tool.execute(input, context)
  toolResults.push({
    type: 'tool_result',
    tool_use_id: block.id,
    content: JSON.stringify(result)
  })
} catch (err) {
  // Adiciona erro como resultado
  toolResults.push({
    type: 'tool_result',
    tool_use_id: block.id,
    content: \`Error: \${err.message}\`,
    is_error: true  // ← Marca como erro
  })
  // Agente recebe o erro e pode tentar novamente
}
\`\`\`

---

### **Erro: "Rate limit exceeded"**

**Causa**: Muitas requisições à API Claude.

**Solução**:
\`\`\`typescript
async function callClaudeAPI(options) {
  try {
    return await claude.messages.create(options)
  } catch (err) {
    if (err.status === 429) {
      // Rate limit
      const retryAfter = parseInt(err.headers['retry-after'] || '60')
      console.log(\`Rate limited. Waiting \${retryAfter}s...\`)
      await sleep(retryAfter * 1000)
      return callClaudeAPI(options)  // Retry
    }
    throw err
  }
}
\`\`\`

---

### **Erro: "Worktree already exists"**

**Causa**: Worktree anterior não foi limpo.

**Solução**:
\`\`\`typescript
// Sempre cleanup no finally:
try {
  const worktreePath = await createAgentWorktree(agentId)
  // ... usar worktree
} finally {
  await removeAgentWorktree(agentId)  // Sempre limpa
}

// Ou forçar remoção:
await execAsync(\`git worktree remove \${path} --force\`)
\`\`\`

---

## 7.2 Debugging

### **Habilitar logs detalhados:**
\`\`\`typescript
// Em runAgent.ts:
console.log('[Agent]', agentId, 'Starting...')
console.log('[Agent]', agentId, 'Messages:', messages.length)
console.log('[Agent]', agentId, 'Calling API...')
console.log('[Agent]', agentId, 'Response:', response.stop_reason)
console.log('[Agent]', agentId, 'Tool calls:', toolCalls.map(t => t.name))
\`\`\`

### **Inspecionar memória:**
\`\`\`bash
cat ~/.my_agents/agent-123/memory.json | jq .
\`\`\`

### **Ver worktrees ativos:**
\`\`\`bash
git worktree list
\`\`\`

### **Verificar contexto:**
\`\`\`typescript
const context = getCurrentAgentContext()
console.log('Agent ID:', context?.agentId)
console.log('Working Dir:', context?.workingDirectory)
\`\`\`

---

# 8. CHECKLIST FINAL

## ✅ Implementação Básica

- [ ] Tool.ts implementado
- [ ] ids.ts e message.ts copiados
- [ ] uuid.ts funcionando
- [ ] agentContext.ts implementado
- [ ] agentMemory.ts salva/carrega
- [ ] runAgent.ts executa loop
- [ ] LocalAgentTask orquestra
- [ ] AgentTool.tsx funcional
- [ ] Testado com agente simples

## ✅ Features Avançadas

- [ ] forkSubagent.ts implementado
- [ ] Fork funciona com contexto herdado
- [ ] teammate.ts implementado
- [ ] InProcessTeammateTask funcionando
- [ ] Mensagens entre teammates
- [ ] worktree.ts implementado
- [ ] Isolamento Git funciona
- [ ] Merge de worktree funciona

## ✅ Qualidade

- [ ] Tratamento de erros em todos os lugares
- [ ] Cleanup de recursos (worktrees, memória)
- [ ] Logs para debugging
- [ ] Documentação de funções
- [ ] Testes básicos

---

# 9. RECURSOS ADICIONAIS

## Documentação da API Claude
https://docs.anthropic.com/claude/reference

## Exemplo de Tool Use
https://docs.anthropic.com/claude/docs/tool-use

## Git Worktrees
https://git-scm.com/docs/git-worktree

## AsyncLocalStorage
https://nodejs.org/api/async_context.html

---

**FIM DO GUIA**

**Versão**: 1.0  
**Páginas**: ~50 (estimado)  
**Tempo de leitura**: 2-3 horas  
**Tempo de implementação**: 5-10 horas

Este guia contém TUDO o que você precisa para implementar o sistema multi-agente completo. Siga passo a passo e você terá um sistema funcional! 🚀
