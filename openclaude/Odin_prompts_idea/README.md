# 🎯 Odin Prompts Idea - Sistema de Prompts

Sistema completo de prompts do OpenClaude - os prompts que fazem o agente funcionar corretamente.

---

## 📂 Estrutura

\`\`\`
Odin_prompts_idea/
├── constants/
│   ├── prompts.ts ⭐ (915 linhas) - Prompts principais
│   ├── systemPromptSections.ts - Seções modulares
│   ├── outputStyles.ts - Estilos de output
│   └── cyberRiskInstruction.ts - Instruções de segurança
│
├── utils/
│   ├── systemPrompt.ts - Builder de system prompts
│   └── systemPromptType.ts - Tipos
│
├── tools_prompts/
│   └── prompt.ts - Prompts das tools
│
└── examples/
    └── (exemplos de uso)
\`\`\`

---

## 🎯 O Que São Prompts?

**Prompts** são as instruções que o modelo de IA (Claude) recebe para saber:
- Como se comportar
- Quando usar cada tool
- Como responder ao usuário
- Regras e restrições
- Melhores práticas

---

## 🌟 Arquivo Principal: prompts.ts

### **Tamanho:** 915 linhas de prompts extremamente refinados

### **Seções Principais:**

#### 1. **System Communication**
Como o sistema se comunica com o agente

#### 2. **Tone and Style**
Tom e estilo de resposta

#### 3. **Tool Calling**
Instruções de como usar tools

#### 4. **Making Code Changes**
Como fazer mudanças em código

#### 5. **Linter Errors**
Tratamento de erros de linter

#### 6. **Citing Code**
Como citar código com referências

#### 7. **Git Operations**
Instruções detalhadas para Git (commits, PRs)

#### 8. **Ambition**
Motivação para tarefas complexas

#### 9. **Professional Objectivity**
Manter objetividade técnica

---

## 📋 Prompts das Tools

Cada tool tem seu próprio prompt que ensina:
- O que a tool faz
- Como usar
- Quando usar
- Exemplos
- Erros comuns

### **Exemplo: BashTool**
- Quando usar bash vs tools dedicadas
- Como lidar com comandos perigosos
- Sandbox restrictions
- Git operations
- Background execution

### **Exemplo: FileEditTool**
- Sempre ler arquivo primeiro
- Como fazer substituições exatas
- Preservar indentação
- Usar contexto suficiente

---

## 🎨 System Prompt Sections

Prompts modulares que podem ser combinados:

\`\`\`typescript
// Seções disponíveis:
- general_instructions
- tool_usage
- code_editing
- git_operations
- security_guidelines
- context_management
- error_handling
\`\`\`

---

## 💡 Por Que Estes Prompts São Valiosos?

### **1. Anos de Refinamento**
- Testados com milhares de usuários
- Bugs e edge cases descobertos e corrigidos
- Comportamentos indesejados eliminados

### **2. Extremamente Específicos**
```
❌ Prompt genérico: "Use tools corretamente"

✅ Prompt OpenClaude: 
"Don't refer to tool names when speaking to the USER. 
Instead, just say what the tool is doing in natural language.
Example: Instead of 'I'll use FileReadTool', say 'Let me read that file'"
```

### **3. Cobrem Casos Reais**
- "Never use git commands with -i flag (interactive)"
- "Always quote file paths with spaces"
- "Don't create empty code blocks for references"

### **4. Instruções de Git Perfeitas**
Prompts para:
- Commits (formato, mensagens, safety)
- Pull requests (título, corpo, test plan)
- Merge conflicts
- Operações perigosas (force push, reset --hard)

---

## 🔧 Como Usar

### **Opção 1: Usar Completo**
\`\`\`typescript
import { getSystemPrompt } from './utils/systemPrompt'

const systemPrompt = await getSystemPrompt({
  tools: availableTools,
  model: 'claude-sonnet-4',
  cwd: process.cwd()
})

// Usar no API call
const response = await claude.messages.create({
  model: 'claude-sonnet-4',
  system: systemPrompt,
  messages: [...]
})
\`\`\`

### **Opção 2: Seções Específicas**
\`\`\`typescript
import { systemPromptSection } from './constants/systemPromptSections'

// Pegar apenas seção de Git
const gitPrompt = systemPromptSection('git_operations')

// Combinar várias seções
const customPrompt = [
  systemPromptSection('general_instructions'),
  systemPromptSection('tool_usage'),
  systemPromptSection('code_editing')
].join('\n\n')
\`\`\`

### **Opção 3: Copiar Trechos**
Copie trechos específicos que você precisa:
- Instruções de Git → seu sistema
- Tool usage guidelines → suas tools
- Code editing rules → seu editor de código

---

## 📚 Principais Prompts Por Categoria

### **Git Operations**
\`\`\`markdown
- NEVER update git config
- NEVER skip hooks (--no-verify)
- NEVER force push to main/master
- Always create NEW commits (not amend) after hook failures
- Use heredoc for commit messages
- Check git status after operations
\`\`\`

### **File Operations**
\`\`\`markdown
- MUST use FileReadTool before FileEditTool
- Preserve exact indentation
- Include 3-5 lines of context in old_string
- Never include line numbers in old_string
- Use replace_all for renaming variables
\`\`\`

### **Code Editing**
\`\`\`markdown
- ALWAYS prefer editing existing files
- NEVER create files unless necessary
- No obvious comments ("// Import module")
- Only explain non-obvious intent
- Follow existing code style
\`\`\`

### **Tool Usage**
\`\`\`markdown
- Use specialized tools over bash commands
- Glob for finding files (not find command)
- Grep for searching content (not grep command)
- FileRead for reading (not cat)
- FileEdit for editing (not sed/awk)
\`\`\`

### **Communication**
\`\`\`markdown
- Output text directly (not echo)
- Don't refer to tool names
- Use natural language
- Only use emojis if user requests
\`\`\`

---

## 🎯 Exemplos de Bons vs Maus Prompts

### **Exemplo 1: Referências de Código**

❌ **Prompt genérico:**
"Cite código quando relevante"

✅ **Prompt OpenClaude:**
\`\`\`
Use this exact syntax with three required components:

\`\`\`startLine:endLine:filepath
// code content here
\`\`\`

CRITICAL: Do NOT add language tags to this format.
Never indent triple backticks.
Always add newline before code fences.
\`\`\`

### **Exemplo 2: Git Commits**

❌ **Prompt genérico:**
"Faça commits claros"

✅ **Prompt OpenClaude:**
\`\`\`
1. Run git status, git diff, git log in PARALLEL
2. Analyze ALL staged changes
3. Draft concise commit message (1-2 sentences)
4. Focus on "why" not "what"
5. Use heredoc format:
   git commit -m "$(cat <<'EOF'
   Your message here
   EOF
   )"
\`\`\`

### **Exemplo 3: Tool Usage**

❌ **Prompt genérico:**
"Use a ferramenta certa"

✅ **Prompt OpenClaude:**
\`\`\`
IMPORTANT: Avoid bash for these operations:
- File search: Use GlobTool (NOT find)
- Content search: Use GrepTool (NOT grep/rg)
- Read files: Use FileReadTool (NOT cat/head/tail)
- Edit files: Use FileEditTool (NOT sed/awk)
- Write files: Use FileWriteTool (NOT echo >/cat <<EOF)

Reason: Dedicated tools provide better UX and easier permission review.
\`\`\`

---

## 🔐 Security Prompts

Instruções de segurança críticas:

\`\`\`markdown
Git Safety Protocol:
- NEVER update git config
- NEVER run destructive commands without user request
- NEVER skip hooks
- NEVER force push to main/master
- When pre-commit hook fails, create NEW commit (not amend)

File Safety:
- Do not commit files with secrets (.env, credentials.json)
- Warn user if they request committing sensitive files

Command Safety:
- Prefer safer alternatives to destructive operations
- Only use destructive ops when truly necessary
- Investigate and fix hook failures (don't bypass)
\`\`\`

---

## 📊 Estatísticas

- **prompts.ts:** 915 linhas
- **Total de arquivos:** 7
- **Categorias de prompts:** 15+
- **Anos de refinamento:** 2+
- **Usuários testados:** Milhares

---

## 💎 Valor Real

O valor NÃO está no código, mas nas **decisões de design** e **lições aprendidas**:

1. ✅ Quais instruções funcionam
2. ✅ Quais causam problemas
3. ✅ Como evitar comportamentos ruins
4. ✅ Como guiar para comportamentos bons
5. ✅ Edge cases descobertos e tratados

---

## 🎓 Como Aprender

1. **Leia prompts.ts completo** - Veja todos os prompts
2. **Analise cada seção** - Entenda o "por quê"
3. **Compare com seus prompts** - O que está faltando?
4. **Teste mudanças** - Veja o impacto
5. **Itere** - Refine baseado em uso real

---

## 🚀 Quick Start

\`\`\`bash
# Ver prompt principal
cat Odin_prompts_idea/constants/prompts.ts | less

# Buscar prompt específico
grep -n "git commit" Odin_prompts_idea/constants/prompts.ts

# Ver todos os prompts de tools
ls Odin_prompts_idea/tools_prompts/
\`\`\`

---

**Este é o "cérebro" que faz o agente funcionar bem!** 🧠

Versão: 1.0  
Data: 11 de maio de 2026
