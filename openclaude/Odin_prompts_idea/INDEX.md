# 📑 ÍNDICE COMPLETO - Odin Prompts Idea

## 🎯 Resumo Executivo

Sistema completo de prompts do OpenClaude - os prompts que fazem o agente funcionar corretamente.

- ✅ 7 arquivos TypeScript
- ✅ 37 KB de documentação (1.255+ linhas)
- ✅ 915 linhas de prompts refinados
- ✅ Guia completo de implementação

---

## 📚 Documentação

### **README.md** (8.3 KB)
- Visão geral do sistema
- Estrutura de arquivos
- Por que são valiosos
- Como usar
- Quick start

### **GUIA_IMPLEMENTACAO.md** (29 KB, 1.255 linhas) ⭐⭐⭐
**O DOCUMENTO MAIS IMPORTANTE**

Contém:
1. O que são prompts e por que importam
2. Anatomia completa do sistema
3. Arquivo por arquivo detalhado
4. Prompts essenciais explicados
5. Como implementar (3 níveis)
6. Customização para seu projeto
7. Exemplos práticos completos
8. Checklist de implementação

### **INDEX.md** (este arquivo)
- Navegação rápida
- Referência rápida

---

## 📂 Arquivos Incluídos

### **constants/prompts.ts** (915 linhas) ⭐⭐⭐
**O ARQUIVO MAIS IMPORTANTE**

Contém TODOS os prompts que fazem o Claude funcionar:
- System reminders
- Tool calling instructions
- Code editing guidelines
- Git operations (commits, PRs)
- Security protocols
- Communication style
- Professional objectivity

**Seções principais:**
- getSystemRemindersSection()
- getToolCallingSection()
- getMakingCodeChangesSection()
- getCitingCodeSection()
- getCommitAndPRInstructions()
- getAmbitionSection()
- getProfessionalObjectivitySection()

### **constants/systemPromptSections.ts**
Seções modulares de prompts que podem ser combinadas individualmente.

### **constants/outputStyles.ts**
Configurações de estilo de output (minimal, concise, detailed, verbose).

### **constants/cyberRiskInstruction.ts**
Instruções de segurança cibernética.

### **utils/systemPrompt.ts**
Builder que monta o system prompt final combinando várias seções.

**Funções principais:**
- `getSystemPrompt()` - Gera prompt completo
- `buildEffectiveSystemPrompt()` - Com cache blocks
- `enhanceSystemPromptWithEnvDetails()` - Adiciona info de ambiente

### **utils/systemPromptType.ts**
Tipos TypeScript para system prompts.

### **tools_prompts/prompt.ts**
Prompts específicos das tools individuais.

---

## 🎯 Como Usar Este Material

### **Para Entender:**
1. Leia `README.md` (15 min)
2. Leia `GUIA_IMPLEMENTACAO.md` seções 1-4 (1 hora)
3. Analise `constants/prompts.ts` (1 hora)

### **Para Implementar:**
1. Leia `GUIA_IMPLEMENTACAO.md` seção 5 (30 min)
2. Escolha nível de implementação:
   - Mínima (15 min)
   - Modular (30 min)
   - Avançada (1 hora)
3. Copie arquivos necessários
4. Teste com sua aplicação

### **Para Customizar:**
1. Leia `GUIA_IMPLEMENTACAO.md` seção 6
2. Identifique suas necessidades
3. Selecione seções relevantes
4. Adicione regras específicas do projeto

---

## 🔍 Busca Rápida

### **Procurando por...**

**Como usar tools corretamente?**
→ `constants/prompts.ts` linha ~200-400
→ `GUIA_IMPLEMENTACAO.md` seção 4.1

**Como fazer commits Git?**
→ `constants/prompts.ts` linha ~600-750
→ `GUIA_IMPLEMENTACAO.md` seção 4.2

**Como editar arquivos?**
→ `constants/prompts.ts` linha ~400-500
→ `GUIA_IMPLEMENTACAO.md` seção 4.3

**Prompt completo exemplo?**
→ `GUIA_IMPLEMENTACAO.md` seção 7.1

**Como implementar?**
→ `GUIA_IMPLEMENTACAO.md` seção 5

**Como customizar?**
→ `GUIA_IMPLEMENTACAO.md` seção 6

---

## 📊 Prompts Por Categoria

### **🛠️ Tool Usage (Mais Importante)**
Ensina quando usar cada tool:
- GlobTool (não find)
- GrepTool (não grep)
- FileReadTool (não cat)
- FileEditTool (não sed)
- FileWriteTool (não echo >)

**Arquivo:** `constants/prompts.ts`
**Seção:** getToolCallingSection()

### **🔒 Git Safety**
Previne desastres:
- Não force push para main
- Não skip hooks
- Não amend após hook failure
- Use heredoc para commits

**Arquivo:** `constants/prompts.ts`
**Seção:** getCommitAndPRInstructions()

### **📝 Code Editing**
Garante qualidade:
- Ler antes de editar
- Preservar indentação
- 3-5 linhas de contexto
- Sem comentários óbvios

**Arquivo:** `constants/prompts.ts`
**Seção:** getMakingCodeChangesSection()

### **💬 Communication**
Tom e estilo:
- Não mencionar nomes de tools
- Não usar echo para comunicar
- Linguagem natural
- Sem emojis (exceto se pedido)

**Arquivo:** `constants/prompts.ts`
**Seção:** Tone and Style

### **🎯 Professional Objectivity**
Comportamento profissional:
- Priorizar precisão técnica
- Fatos sobre validação
- Discordar quando necessário

**Arquivo:** `constants/prompts.ts`
**Seção:** getProfessionalObjectivitySection()

---

## 💡 Exemplos de Uso

### **Exemplo 1: Sistema Básico**

\`\`\`typescript
import { getSystemPrompt } from './utils/systemPrompt'

const prompt = await getSystemPrompt({
  tools: [FileReadTool, FileEditTool, BashTool],
  model: 'claude-sonnet-4'
})

const response = await claude.messages.create({
  model: 'claude-sonnet-4',
  system: prompt,
  messages: [{ role: 'user', content: 'Fix bug in app.ts' }]
})
\`\`\`

### **Exemplo 2: Prompts Modulares**

\`\`\`typescript
const customPrompt = [
  basePrompt,
  toolUsagePrompt,
  gitSafetyPrompt,
  "# Custom Rules",
  "Always write tests for new functions"
].join('\n\n')
\`\`\`

### **Exemplo 3: Com Cache**

\`\`\`typescript
const blocks = [
  {
    type: 'text',
    text: staticPrompts,
    cache_control: { type: 'ephemeral' }
  },
  {
    type: 'text',
    text: dynamicInfo
  }
]
\`\`\`

---

## 🎓 Roadmap de Aprendizado

### **Nível 1: Básico** (1-2 horas)
1. Leia README.md
2. Leia GUIA seções 1-3
3. Veja prompts.ts principais seções
4. Entenda o conceito geral

### **Nível 2: Intermediário** (3-4 horas)
1. Leia GUIA seções 4-5
2. Estude cada prompt essencial
3. Implemente versão básica
4. Teste com casos reais

### **Nível 3: Avançado** (5+ horas)
1. Leia GUIA seções 6-7
2. Customize para seu projeto
3. Implemente com cache
4. Otimize baseado em uso

---

## 📈 Estatísticas

| Métrica | Valor |
|---------|-------|
| Arquivos TS | 7 |
| Linhas de prompts | 915 |
| Linhas de docs | 1.255+ |
| Tamanho docs | 37 KB |
| Seções principais | 9+ |
| Exemplos práticos | 10+ |
| Tempo leitura | 2-3 horas |
| Tempo implementação | 1-3 horas |

---

## 💎 Valor Real

### **O que você ganha:**

1. ✅ **Prompts refinados** por 2+ anos de uso real
2. ✅ **Edge cases cobertos** - bugs descobertos e corrigidos
3. ✅ **Melhores práticas** - o que funciona, o que não funciona
4. ✅ **Instruções específicas** - não genéricas
5. ✅ **Exemplos reais** - não teóricos

### **Economiza:**
- ❌ Meses testando o que funciona
- ❌ Descobrir edge cases do jeito difícil
- ❌ Iterar em prompts que não funcionam
- ❌ Debugar comportamentos ruins

---

## 🚀 Quick Start

\`\`\`bash
# 1. Ver prompt principal
cat Odin_prompts_idea/constants/prompts.ts | less

# 2. Buscar seção específica
grep -A 20 "getToolCallingSection" Odin_prompts_idea/constants/prompts.ts

# 3. Copiar para seu projeto
cp Odin_prompts_idea/constants/prompts.ts meu_projeto/
cp Odin_prompts_idea/utils/systemPrompt.ts meu_projeto/

# 4. Usar
# (ver GUIA_IMPLEMENTACAO.md seção 5)
\`\`\`

---

## ✅ Checklist

### Leitura:
- [ ] Li README.md
- [ ] Li GUIA seções 1-4
- [ ] Analisei prompts.ts
- [ ] Vi exemplos práticos

### Implementação:
- [ ] Copiei arquivos necessários
- [ ] Testei implementação básica
- [ ] Adicionei customizações
- [ ] Validei com casos reais

### Qualidade:
- [ ] Agente usa tools corretamente
- [ ] Git operations são seguras
- [ ] Code quality está boa
- [ ] Communication é natural

---

## 📞 Links Úteis

| Recurso | Localização |
|---------|-------------|
| Visão geral | README.md |
| Guia completo | GUIA_IMPLEMENTACAO.md |
| Prompts principais | constants/prompts.ts |
| Builder | utils/systemPrompt.ts |
| Implementação | GUIA seção 5 |
| Customização | GUIA seção 6 |
| Exemplos | GUIA seção 7 |

---

**Estes são os prompts que fazem o Claude funcionar perfeitamente como assistente de código!** 🧠

Versão: 1.0  
Data: 11 de maio de 2026
