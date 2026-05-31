# 🔧 Utilitários de Shell e Bash

Este documento detalha os utilitários de suporte para as ferramentas de CLI (BashTool, PowerShellTool, REPLTool).

---

## 📁 utils_shell/ - Gerenciamento de Shells (10 arquivos)

Estes arquivos fornecem abstração e gerenciamento para diferentes tipos de shell.

### **bashProvider.ts**
**Função**: Provider específico para shell Bash
- Configura ambiente Bash
- Define variáveis de ambiente
- Configura PATH e shell options
- Inicialização de perfil (~/.bashrc, ~/.bash_profile)

### **powershellProvider.ts**
**Função**: Provider específico para PowerShell
- Configura ambiente PowerShell
- Define ExecutionPolicy
- Configura módulos e PSModulePath
- Inicialização de perfil PowerShell

### **shellProvider.ts**
**Função**: Interface abstrata para providers de shell
- Define contrato comum para shells
- Abstração de comandos
- Interface unificada Bash/PowerShell
- Factory pattern para criação de shells

### **powershellDetection.ts**
**Função**: Detecta instalação e versão do PowerShell
- Procura pwsh (PowerShell Core)
- Procura powershell.exe (Windows PowerShell)
- Verifica versões disponíveis
- Cache de detecção

**Exemplo de uso**:
\`\`\`typescript
const psPath = await getCachedPowerShellPath()
// Retorna: "/usr/local/bin/pwsh" ou "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
\`\`\`

### **resolveDefaultShell.ts**
**Função**: Determina o shell padrão do sistema
- Lê $SHELL no Unix/Linux/macOS
- Detecta shell do usuário
- Fallback para /bin/bash ou /bin/sh
- No Windows, detecta cmd.exe ou PowerShell

**Lógica**:
\`\`\`typescript
1. Verifica variável $SHELL
2. Lê /etc/passwd para usuário atual
3. Fallback: /bin/bash -> /bin/sh -> /bin/zsh
\`\`\`

### **shellToolUtils.ts**
**Função**: Utilitários compartilhados entre tools
- Escape de strings para shell
- Validação de comandos
- Formatação de output
- Helpers de execução

### **prefix.ts**
**Função**: Gerenciamento de prefixos de comando
- Adiciona prefixos ao comando (cd, export, etc.)
- Mantém contexto entre comandos
- Working directory persistence
- Environment variables

### **specPrefix.ts**
**Função**: Especificação de como prefixos são aplicados
- Define regras de prefixação
- Validação de sintaxe
- Parsing de spec strings

### **outputLimits.ts**
**Função**: Gerencia limites de saída de comandos
- Define tamanhos máximos de output
- Truncamento inteligente
- Preservação de início/fim
- Proteção contra memory overflow

**Limites típicos**:
\`\`\`typescript
MAX_OUTPUT_CHARS: 500_000
MAX_LINES: 50_000
TRUNCATE_THRESHOLD: 100_000
\`\`\`

### **readOnlyCommandValidation.ts**
**Função**: Valida se comando é somente leitura
- Detecta comandos que modificam o sistema
- Lista branca de comandos read-only
- Proteção em modo read-only
- Validação de flags destrutivas

**Comandos read-only**:
- ls, cat, grep, find, head, tail
- git log, git diff, git status
- ps, top, df, du

**Comandos NÃO read-only**:
- rm, mv, cp, mkdir
- git commit, git push
- npm install, pip install

---

## 📁 utils_bash/ - Parsing de Bash (16 arquivos + 1 pasta)

Parser completo de sintaxe Bash para análise estática e segurança.

### **bashParser.ts**
**Função**: Parser principal de comandos Bash
- Análise sintática completa
- Suporte a pipes, redirecionamentos
- Detecção de comandos encadeados
- Parsing de subshells

**Exemplo**:
\`\`\`typescript
const parsed = parseBashCommand("ls -la | grep '.ts' && echo 'Found'")
// Retorna AST com:
// - Command: ls
// - Pipe to: grep
// - And then: echo
\`\`\`

### **ast.ts**
**Função**: Abstract Syntax Tree para comandos
- Estrutura de dados para comando parseado
- Nós da árvore sintática
- Visitadores de AST
- Transformações de AST

**Estrutura típica**:
\`\`\`typescript
interface CommandAST {
  type: 'command' | 'pipeline' | 'list'
  command?: string
  args?: string[]
  redirects?: Redirect[]
  children?: CommandAST[]
}
\`\`\`

### **commands.ts**
**Função**: Análise e categorização de comandos
- Identifica tipo de comando
- Extrai nome e argumentos
- Detecta comandos perigosos
- Classifica semântica do comando

**Categorias**:
- Leitura (cat, ls, grep)
- Escrita (rm, mv, cp)
- Execução (bash, python, node)
- Sistema (sudo, systemctl)
- Rede (curl, wget, ssh)

### **shellQuote.ts** e **shellQuoting.ts**
**Função**: Sistema de quotes e escaping
- Escape de caracteres especiais
- Preservação de espaços
- Quotes simples vs duplas
- Substituição de variáveis

**Exemplos**:
\`\`\`typescript
shellQuote("file with spaces.txt")
// Retorna: "file with spaces.txt"

shellQuote("$USER's file")
// Retorna: '$USER'"'"'s file'
\`\`\`

### **bashPipeCommand.ts**
**Função**: Análise específica de pipes
- Parse de pipelines complexos
- Validação de comandos encadeados
- Detecção de erros de sintaxe
- Otimização de pipes

**Exemplo**:
\`\`\`bash
cat file.txt | grep "error" | wc -l | xargs echo "Errors:"
\`\`\`

### **shellCompletion.ts**
**Função**: Auto-complete de comandos
- Sugestões de comandos
- Completar paths
- Completar flags
- Histórico de comandos

### **parser.ts**
**Função**: Parser genérico base
- Tokenização
- Lexer
- Parser combinators
- Error recovery

### **heredoc.ts**
**Função**: Suporte a heredocs
- Parse de heredoc syntax
- Preservação de conteúdo multi-linha
- Interpolação de variáveis (ou não)
- Delimitadores customizados

**Exemplo de heredoc**:
\`\`\`bash
cat <<EOF
This is a
multi-line
heredoc
EOF
\`\`\`

### **treeSitterAnalysis.ts**
**Função**: Análise com Tree-sitter
- Parser mais robusto usando Tree-sitter
- Análise sintática precisa
- Suporte a erros de sintaxe
- Queries de padrões

**Tree-sitter** = Parser generator usado pelo GitHub

### **registry.ts**
**Função**: Registro de comandos conhecidos
- Lista de comandos instalados
- Cache de lookups
- Verificação de disponibilidade
- Aliases de comandos

### **ParsedCommand.ts**
**Função**: Tipos TypeScript para comandos parseados
\`\`\`typescript
interface ParsedCommand {
  command: string
  args: string[]
  stdin?: string
  stdout?: string
  stderr?: string
  background?: boolean
  env?: Record<string, string>
}
\`\`\`

### **ShellSnapshot.ts**
**Função**: Snapshot de estado do shell
- Captura working directory
- Captura variáveis de ambiente
- Captura histórico
- Restauração de estado

**Uso**:
\`\`\`typescript
const snapshot = await captureShellSnapshot()
// ... executar comandos ...
await restoreShellSnapshot(snapshot)
\`\`\`

### **shellPrefix.ts** e **prefix.ts**
**Função**: Gerenciamento de prefixos de shell
- cd persistence
- export persistence
- alias handling

### **specs/**
**Função**: Pasta com especificações
- Testes de parsing
- Casos de uso
- Gramática formal
- Exemplos de comandos

---

## 📁 shared/ - Utilitários Compartilhados (2 arquivos)

### **gitOperationTracking.ts**
**Função**: Rastreamento de operações Git
- Monitora git commits
- Monitora git push
- Monitora git checkout
- Telemetria de operações Git
- Prevenção de operações perigosas

**Operações rastreadas**:
\`\`\`typescript
- git commit
- git push (especialmente --force)
- git reset --hard
- git checkout
- git rebase
- git merge
\`\`\`

**Proteções**:
- Avisa antes de force push
- Confirma antes de reset --hard
- Valida branch antes de push
- Rastreia para analytics

### **spawnMultiAgent.ts**
**Função**: Spawn de múltiplos agentes/subagentes
- Cria processos filhos
- Gerencia comunicação entre agentes
- Paralelização de tarefas
- Sincronização de estado

**Exemplo de uso**:
\`\`\`typescript
// Executar múltiplas tarefas em paralelo
const agents = await spawnMultiAgent([
  { task: 'analyze_code', file: 'app.ts' },
  { task: 'run_tests', suite: 'unit' },
  { task: 'lint_code', path: 'src/' }
])

await Promise.all(agents.map(a => a.complete()))
\`\`\`

---

## 🔗 Integração com as Tools

### Como BashTool usa estes utilitários:

\`\`\`typescript
// 1. Resolve shell padrão
const shell = await resolveDefaultShell()  // /bin/bash

// 2. Cria provider
const provider = new BashProvider(shell)

// 3. Parseia comando
const parsed = bashParser.parse("ls -la | grep .ts")

// 4. Valida segurança
const isReadOnly = validateReadOnly(parsed)
const isDangerous = checkDestructiveCommand(parsed)

// 5. Aplica prefixos (cd, env vars)
const withPrefix = applyPrefix(parsed, currentWorkingDir)

// 6. Executa
const result = await provider.execute(withPrefix)

// 7. Limita output
const truncated = applyOutputLimits(result.stdout)

// 8. Rastreia operações Git (se houver)
if (isGitCommand(parsed)) {
  trackGitOperation(parsed)
}
\`\`\`

---

## 🛡️ Segurança

### Validações de Segurança Implementadas:

#### **1. Parsing Seguro**
- AST completo antes de executar
- Detecta code injection
- Valida sintaxe

#### **2. Comando Read-Only**
\`\`\`typescript
// Modo read-only bloqueia:
rm file.txt          // ❌ BLOQUEADO
git commit           // ❌ BLOQUEADO
npm install          // ❌ BLOQUEADO

// Permite:
ls -la               // ✅ PERMITIDO
cat file.txt         // ✅ PERMITIDO
git diff             // ✅ PERMITIDO
\`\`\`

#### **3. Comandos Destrutivos**
\`\`\`typescript
// Comandos que sempre geram aviso:
- rm -rf /
- git push --force
- git reset --hard
- DROP TABLE
- sudo rm
\`\`\`

#### **4. Quote Escaping**
Previne shell injection:
\`\`\`typescript
// Input malicioso:
const userInput = "; rm -rf /"

// Com escaping correto:
const safe = shellQuote(userInput)
// Resultado: "\\; rm -rf /"  (executado como string literal)
\`\`\`

#### **5. Output Limits**
Previne DOS via output infinito:
\`\`\`bash
# Comando perigoso:
cat /dev/zero

# Sistema limita a 500KB e trunca
\`\`\`

---

## 📊 Fluxo de Execução Completo

\`\`\`
┌─────────────────┐
│  Usuário Input  │
│  "ls | grep .ts"│
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│   bashParser.ts     │
│   Parse comando     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│      ast.ts         │
│   Criar AST         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────┐
│ readOnlyCommandValidation.ts│
│   Validar segurança         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────┐
│   shellProvider.ts  │
│   Selecionar shell  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   prefix.ts         │
│   Adicionar prefixos│
│   (cd, export)      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   shellQuote.ts     │
│   Escapar strings   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  bashProvider.ts    │
│  EXECUTAR           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  outputLimits.ts    │
│  Limitar output     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ gitOperationTracking│
│ (se comando Git)    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   Retornar para     │
│   BashTool          │
└─────────────────────┘
\`\`\`

---

## 🎯 Casos de Uso Reais

### **Caso 1: Comando com Pipe**
\`\`\`bash
ls -la | grep ".ts" | wc -l
\`\`\`

**Processamento**:
1. bashParser: identifica 3 comandos em pipe
2. ast: cria AST com pipeline
3. readOnlyValidation: todos read-only ✅
4. shellProvider: executa via bash
5. outputLimits: output pequeno, não trunca

---

### **Caso 2: Comando Destrutivo**
\`\`\`bash
rm -rf /importante
\`\`\`

**Processamento**:
1. bashParser: identifica "rm -rf"
2. destructiveCommandWarning: 🚨 AVISO
3. Solicita confirmação do usuário
4. Se aprovado, executa
5. gitOperationTracking: não é Git, skip

---

### **Caso 3: Git Commit**
\`\`\`bash
git commit -m "feat: nova funcionalidade"
\`\`\`

**Processamento**:
1. bashParser: identifica "git commit"
2. readOnlyValidation: NOT read-only (escreve)
3. gitOperationTracking: RASTREIA commit
4. shellProvider: executa
5. Telemetria: registra commit event

---

## 📚 Referências

### Especificações de Shell
- **Bash Manual**: https://www.gnu.org/software/bash/manual/
- **POSIX Shell**: IEEE Std 1003.1
- **PowerShell Docs**: https://docs.microsoft.com/powershell/

### Parsing
- **Tree-sitter**: https://tree-sitter.github.io/
- **Bash Grammar**: tree-sitter-bash

### Segurança
- **Shell Injection**: OWASP Top 10
- **Command Injection**: CWE-78

---

**Versão**: 1.0  
**Arquivos Documentados**: 28  
**Total com Tools**: 93 arquivos

🔧 **Utilitários completos de Shell e Bash para OpenClaude!**
