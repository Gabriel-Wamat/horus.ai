# 🤖 Odin Agentes Idea - Sistema Multi-Agente

Sistema completo de gerenciamento de agentes IA do OpenClaude.

---

## 📂 Estrutura

\`\`\`
Odin_agentes_idea/
├── AgentTool/          (18 arquivos) - Tool principal de agentes
├── tasks/              (6 pastas) - Gerenciamento de tasks
├── utils_agent/        (6 arquivos) - Utilitários de agente
├── services_agent/     (2 pastas) - Serviços
└── shared/             (2 arquivos) - Compartilhados
\`\`\`

**Total: 40 arquivos TypeScript**

---

## 🎯 Componentes Principais

### 1. **AgentTool/** - Core do Sistema de Agentes

| Arquivo | Função |
|---------|--------|
| \`AgentTool.tsx\` | Tool principal - cria e gerencia agentes |
| \`runAgent.ts\` | Execução de agentes |
| \`agentMemory.ts\` | Sistema de memória entre agentes |
| \`agentMemorySnapshot.ts\` | Snapshots de memória |
| \`forkSubagent.ts\` | Fork de subagentes (clonar contexto) |
| \`resumeAgent.ts\` | Retomar agentes pausados |
| \`agentToolUtils.ts\` | Utilitários principais |
| \`agentDisplay.ts\` | Visualização de agentes |
| \`agentColorManager.ts\` | Cores para diferenciar agentes |
| \`builtInAgents.ts\` | Registro de agentes built-in |
| \`loadAgentsDir.ts\` | Carregar agentes de diretório |
| \`constants.ts\` | Constantes |
| \`prompt.ts\` | Prompts do sistema |

#### **built-in/** - Agentes Especializados

| Arquivo | Tipo de Agente |
|---------|----------------|
| \`generalPurposeAgent.ts\` | Agente genérico |
| \`planAgent.ts\` | Planejamento de tarefas |
| \`exploreAgent.ts\` | Exploração de código |
| \`verificationAgent.ts\` | Verificação de código |
| \`claudeCodeGuideAgent.ts\` | Guia do Cursor |
| \`statuslineSetup.ts\` | Setup de statusline |

---

### 2. **tasks/** - Gerenciamento de Tasks

#### **LocalAgentTask/**
Execução de agentes localmente
- Gerenciamento de lifecycle
- Progress tracking
- Cancelamento
- Background execution

#### **InProcessTeammateTask/**
Multi-agente no mesmo processo
- Comunicação entre agentes
- Contexto compartilhado
- Sincronização

#### **RemoteAgentTask/**
Execução remota de agentes
- Cloud execution
- Distribuição de carga
- Isolamento completo

#### **Arquivos principais:**
- \`types.ts\` - Tipos de tasks
- \`stopTask.ts\` - Parar tasks
- \`pillLabel.ts\` - Labels de UI

---

### 3. **utils_agent/** - Utilitários de Agente

| Arquivo | Função |
|---------|--------|
| \`agentContext.ts\` | Contexto de execução de agente |
| \`teammate.ts\` | Sistema de "teammates" (multi-agente) |
| \`teammateContext.ts\` | Contexto de teammate |
| \`agentSwarmsEnabled.ts\` | Feature flag de swarms |
| \`forkedAgent.ts\` | Fork de agentes |
| \`worktree.ts\` | Isolamento Git com worktrees |

---

### 4. **services_agent/** - Serviços

#### **AgentSummary/**
Gera resumos de execução de agentes
- Sumarização automática
- Tracking de progresso
- Métricas de performance

#### **SessionMemory/**
Memória persistente de sessão
- Armazena contexto entre execuções
- Recupera estado anterior
- Cache inteligente

---

### 5. **shared/** - Compartilhados

| Arquivo | Função |
|---------|--------|
| \`gitOperationTracking.ts\` | Rastreia operações Git |
| \`spawnMultiAgent.ts\` | Spawn de múltiplos agentes |

---

## 🔄 Fluxo de Execução

\`\`\`
┌─────────────┐
│   Usuário   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│   AgentTool      │ (cria agente)
│   .tsx           │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  LocalAgentTask  │ (gerencia lifecycle)
│                  │
└──────┬───────────┘
       │
       ├──────────► agentContext.ts (setup contexto)
       │
       ├──────────► agentMemory.ts (carrega memória)
       │
       ▼
┌──────────────────┐
│   runAgent.ts    │ (executa)
│                  │
└──────┬───────────┘
       │
       ├──────────► Tools (BashTool, FileEdit, etc.)
       │
       ├──────────► SessionMemory (persiste estado)
       │
       ▼
┌──────────────────┐
│   Resultado      │
│   + Memória      │
└──────────────────┘
\`\`\`

---

## 💡 Casos de Uso

### **1. Agente Simples**
\`\`\`typescript
// Criar um agente para fazer uma tarefa
{
  tool: "AgentTool",
  input: {
    description: "Analisar código",
    prompt: "Analise o arquivo app.ts e encontre bugs",
    subagent_type: "generalPurpose"
  }
}
\`\`\`

### **2. Fork de Agente**
\`\`\`typescript
// Clonar agente atual com contexto
{
  tool: "AgentTool",
  input: {
    description: "Explorar alternativa",
    prompt: "Tente uma abordagem diferente",
    resume: "self"  // Fork do agente atual
  }
}
\`\`\`

### **3. Isolamento com Worktree**
\`\`\`typescript
// Agente em worktree isolado (branch temporário)
{
  tool: "AgentTool",
  input: {
    description: "Refatorar código",
    prompt: "Refatore a arquitetura sem afetar main",
    isolation: "worktree"  // Git worktree isolado
  }
}
\`\`\`

### **4. Background Execution**
\`\`\`typescript
// Executar em background
{
  tool: "AgentTool",
  input: {
    description: "Testes longos",
    prompt: "Execute toda suite de testes",
    run_in_background: true
  }
}
\`\`\`

### **5. Multi-Agente (Teammates)**
\`\`\`typescript
// Criar time de agentes
{
  tool: "AgentTool",
  input: {
    description: "Backend dev",
    prompt: "Implemente a API",
    name: "backend_agent",
    team_name: "dev_team"
  }
}

// Outro agente no mesmo time
{
  tool: "AgentTool",
  input: {
    description: "Frontend dev",
    prompt: "Crie a interface",
    name: "frontend_agent",
    team_name: "dev_team"  // Mesmo time
  }
}

// Agentes podem se comunicar via SendMessageTool
\`\`\`

---

## 🔑 Conceitos-Chave

### **Agent vs Task**
- **Agent**: Instância de IA com contexto e memória
- **Task**: Unidade de trabalho que um agente executa

### **Fork vs Spawn**
- **Fork**: Clonar agente atual com TODO o contexto
- **Spawn**: Criar novo agente do zero

### **Local vs Remote**
- **Local**: Executa na máquina local
- **Remote**: Executa em servidor/cloud

### **Worktree**
Git worktree = branch temporário isolado
- Não afeta branch principal
- Agente trabalha em cópia isolada
- Fácil de descartar ou mergear

### **Teammate**
Agente que faz parte de um "time"
- Pode se comunicar com outros teammates
- Compartilha contexto de time
- Coordenação entre agentes

---

## 🧠 Sistema de Memória

### **Tipos de Memória**

1. **Session Memory** (curto prazo)
   - Dura enquanto agente está ativo
   - Contexto de conversação
   - Estado atual

2. **Agent Memory** (médio prazo)
   - Persiste entre pausas/retomadas
   - Memória de trabalho
   - Decisões anteriores

3. **Memory Snapshot** (long prazo)
   - Snapshots salvos em disco
   - Recuperável depois
   - Histórico completo

---

## 🎨 Agentes Built-in

### **generalPurposeAgent**
Agente genérico para qualquer tarefa
- Usa todas as tools disponíveis
- Não especializado

### **planAgent**
Planejamento antes de executar
- Cria plano detalhado
- Pede aprovação do usuário
- Executa passo-a-passo

### **exploreAgent**
Exploração de código
- Read-only (não modifica)
- Busca e analisa
- Responde perguntas sobre código

### **verificationAgent**
Verificação de código
- Valida mudanças
- Executa testes
- Checa linters

---

## 🔒 Segurança

### **Isolamento**
- Worktrees: isolamento Git
- Remote: isolamento completo
- Sandboxing: restrições de filesystem

### **Permissões**
- Modo "plan": requer aprovação
- Modo "ask": pergunta antes de executar
- Modo "auto": executa automaticamente

### **Cancelamento**
- Todos os agentes podem ser cancelados
- Cleanup automático de recursos
- Estado sempre consistente

---

## 📊 Progress Tracking

\`\`\`typescript
// Sistema automático de tracking
- Contador de tokens
- Tempo de execução
- Tools executadas
- Progresso de sub-tarefas
- Notificações quando completo
\`\`\`

---

## 🚀 Como Usar

### **1. Criar Agente Básico**
\`\`\`typescript
import { AgentTool } from './AgentTool/AgentTool'
import { LocalAgentTask } from './tasks/LocalAgentTask'

// Tool cria task
const result = await AgentTool.execute({
  description: "Minha tarefa",
  prompt: "Faça algo útil"
})
\`\`\`

### **2. Agente com Memória**
\`\`\`typescript
import { agentMemory } from './AgentTool/agentMemory'

// Salvar memória
await agentMemory.save(agentId, context)

// Recuperar memória
const context = await agentMemory.load(agentId)
\`\`\`

### **3. Fork de Agente**
\`\`\`typescript
import { forkSubagent } from './AgentTool/forkSubagent'

// Fork com todo o contexto atual
const forkedAgent = await forkSubagent({
  resume: "self",
  prompt: "Nova tarefa com contexto herdado"
})
\`\`\`

---

## 🔗 Dependências

### **AgentTool depende de:**
- LocalAgentTask (execução)
- agentContext (contexto)
- agentMemory (memória)
- runAgent (runtime)

### **LocalAgentTask depende de:**
- agentContext
- SessionMemory
- Tools (BashTool, FileEdit, etc.)

### **Multi-agente depende de:**
- teammate.ts
- InProcessTeammateTask
- spawnMultiAgent.ts

---

## 📈 Arquitetura

\`\`\`
AgentTool (interface)
    ↓
LocalAgentTask (orquestração)
    ↓
┌───────────┬──────────┬────────────┐
│           │          │            │
runAgent  Memory   Context    Progress
    ↓         ↓          ↓            ↓
  Tools   Storage   State      Tracking
\`\`\`

---

## 💎 Pontos-Chave

1. **Modular**: Cada componente é independente
2. **Extensível**: Fácil adicionar novos agentes
3. **Robusto**: Tratamento de erros em todas as camadas
4. **Escalável**: Local → Remote conforme necessidade
5. **Seguro**: Múltiplas camadas de validação

---

## 🎯 Próximos Passos

1. **Estudar AgentTool.tsx** - Entender como agentes são criados
2. **Ver runAgent.ts** - Como executam
3. **Explorar built-in/** - Exemplos de agentes especializados
4. **Testar LocalAgentTask** - Lifecycle de tasks
5. **Entender memória** - Como contexto persiste

---

## 📚 Arquivos Essenciais para Começar

### **Leitura Obrigatória:**
1. \`AgentTool/AgentTool.tsx\` - Ponto de entrada
2. \`AgentTool/runAgent.ts\` - Execução
3. \`tasks/LocalAgentTask/\` - Orquestração
4. \`utils_agent/agentContext.ts\` - Contexto

### **Leitura Recomendada:**
5. \`AgentTool/agentMemory.ts\` - Memória
6. \`AgentTool/built-in/generalPurposeAgent.ts\` - Exemplo
7. \`AgentTool/forkSubagent.ts\` - Fork

### **Leitura Avançada:**
8. \`tasks/InProcessTeammateTask/\` - Multi-agente
9. \`utils_agent/worktree.ts\` - Isolamento Git
10. \`services_agent/SessionMemory/\` - Persistência

---

**Versão**: 1.0  
**Data**: 11 de maio de 2026  
**Arquivos**: 40 TypeScript

🤖 **Sistema Multi-Agente Completo do OpenClaude!**
