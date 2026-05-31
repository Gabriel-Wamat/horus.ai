# Odin Tools CLI

Este diretório contém cópias dos arquivos de ferramentas CLI do projeto OpenClaude.

## Estrutura

### 📁 BashTool (20 arquivos)
Ferramentas para execução de comandos Bash/Shell no terminal.

**Arquivos principais:**
- `BashTool.tsx` - Componente principal do tool Bash
- `BashToolResultMessage.tsx` - Componente de exibição de resultados
- `bashCommandHelpers.ts` - Funções auxiliares para comandos
- `bashPermissions.ts` - Gerenciamento de permissões
- `bashSecurity.ts` - Validações de segurança
- `sedEditParser.ts` - Parser para comandos sed
- `commandSemantics.ts` - Semântica de comandos
- `prompt.ts` - Prompts do sistema
- `utils.ts` - Utilitários gerais

**Validação e Segurança:**
- `readOnlyValidation.ts` - Validação de modo somente leitura
- `modeValidation.ts` - Validação de modos de execução
- `pathValidation.ts` - Validação de caminhos
- `sedValidation.ts` - Validação de comandos sed
- `destructiveCommandWarning.ts` - Avisos para comandos destrutivos
- `shouldUseSandbox.ts` - Lógica de sandbox

**Interface:**
- `UI.tsx` - Componente de interface do usuário
- `commentLabel.ts` - Labels de comentários
- `toolName.ts` - Nome da ferramenta

**Testes:**
- `modeValidation.test.ts` - Testes de validação de modo
- `sedEditParser.test.ts` - Testes do parser sed

---

### 📁 PowerShellTool (14 arquivos)
Ferramentas para execução de comandos PowerShell no Windows.

**Arquivos principais:**
- `PowerShellTool.tsx` - Componente principal do tool PowerShell
- `commandSemantics.ts` - Semântica de comandos PowerShell
- `commonParameters.ts` - Parâmetros comuns do PowerShell
- `prompt.ts` - Prompts do sistema
- `clmTypes.ts` - Tipos CLM (Constrained Language Mode)

**Validação e Segurança:**
- `powershellSecurity.ts` - Segurança do PowerShell
- `powershellPermissions.ts` - Gerenciamento de permissões
- `readOnlyValidation.ts` - Validação de modo somente leitura
- `modeValidation.ts` - Validação de modos
- `pathValidation.ts` - Validação de caminhos
- `gitSafety.ts` - Segurança para operações Git
- `destructiveCommandWarning.ts` - Avisos para comandos destrutivos

**Interface:**
- `UI.tsx` - Componente de interface do usuário
- `toolName.ts` - Nome da ferramenta

---

### 📁 REPLTool (3 arquivos)
Ferramentas para ambiente REPL (Read-Eval-Print Loop) interativo.

**Arquivos:**
- `REPLTool.ts` - Implementação principal do REPL
- `primitiveTools.ts` - Ferramentas primitivas do REPL
- `constants.ts` - Constantes do REPL

---

### 📁 utils_shell (10 arquivos)
Utilitários para gerenciamento de shells (Bash/PowerShell).

**Arquivos:**
- `bashProvider.ts` - Provider de shell Bash
- `powershellProvider.ts` - Provider de PowerShell
- `shellProvider.ts` - Interface abstrata de shell
- `powershellDetection.ts` - Detecção automática de PowerShell
- `resolveDefaultShell.ts` - Resolve shell padrão do sistema
- `shellToolUtils.ts` - Utilitários compartilhados
- `prefix.ts` - Prefixos de comando
- `specPrefix.ts` - Especificação de prefixos
- `outputLimits.ts` - Limites de saída
- `readOnlyCommandValidation.ts` - Validação de comandos read-only

### 📁 utils_bash (16 arquivos)
Utilitários para parsing e análise de comandos Bash.

**Arquivos principais:**
- `bashParser.ts` - Parser de sintaxe Bash
- `ast.ts` - Abstract Syntax Tree para comandos
- `commands.ts` - Análise de comandos
- `shellQuote.ts` / `shellQuoting.ts` - Sistema de quotes
- `bashPipeCommand.ts` - Análise de pipes
- `shellCompletion.ts` - Auto-complete de shell
- `parser.ts` - Parser genérico
- `heredoc.ts` - Suporte a heredocs
- `treeSitterAnalysis.ts` - Análise com Tree-sitter
- `registry.ts` - Registro de comandos
- `ParsedCommand.ts` - Tipos de comando parseado
- `ShellSnapshot.ts` - Snapshot de estado do shell

### 📁 shared (2 arquivos)
Utilitários compartilhados entre diferentes tools.

**Arquivos:**
- `gitOperationTracking.ts` - Rastreamento de operações Git
- `spawnMultiAgent.ts` - Spawn de múltiplos agentes

---

## Resumo

**Total de arquivos: 93**

Estes tools e utilitários de CLI são responsáveis por:
- Execução segura de comandos shell (Bash/PowerShell)
- Validação de permissões e segurança
- Interface com o usuário para comandos de terminal
- Ambiente REPL interativo
- Proteção contra comandos destrutivos
- Suporte a diferentes sistemas operacionais (Unix/Linux/Windows)

---

*Cópia criada em: 10 de maio de 2026*
