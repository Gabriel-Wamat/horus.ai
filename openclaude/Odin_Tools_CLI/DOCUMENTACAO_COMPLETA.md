# 📚 Documentação Completa - Odin Tools CLI

## 🎯 Visão Geral

Esta pasta contém **8 ferramentas (Tools)** essenciais do projeto OpenClaude, divididas em duas categorias principais:

1. **Execução de Comandos & Terminal** (3 tools)
2. **Manipulação de Arquivos** (5 tools)

Essas ferramentas formam a base de um assistente de IA capaz de interagir com o sistema operacional e manipular arquivos de forma segura e eficiente.

---

## 📂 Estrutura da Pasta

\`\`\`
Odin_Tools_CLI/
├── BashTool/           (20 arquivos) - Comandos Bash/Shell
├── PowerShellTool/     (14 arquivos) - Comandos PowerShell
├── REPLTool/           (3 arquivos)  - Ambiente REPL
├── FileReadTool/       (5 arquivos)  - Leitura de arquivos
├── FileWriteTool/      (3 arquivos)  - Escrita de arquivos
├── FileEditTool/       (6 arquivos)  - Edição de arquivos
├── GlobTool/           (3 arquivos)  - Busca de arquivos
├── NotebookEditTool/   (4 arquivos)  - Edição de notebooks
├── README.md
└── DOCUMENTACAO_COMPLETA.md (este arquivo)
\`\`\`

**Total: 58 arquivos**

---

# 🖥️ CATEGORIA 1: EXECUÇÃO DE COMANDOS & TERMINAL

## 1️⃣ BashTool - Execução de Comandos Shell

### 📋 O que é?
Ferramenta para executar comandos shell/bash em sistemas Unix-like (Linux, macOS). É o equivalente a ter acesso a um terminal completo dentro do assistente de IA.

### 🎯 Para que serve?
- Executar comandos do sistema operacional
- Navegar pelo sistema de arquivos
- Gerenciar processos
- Executar scripts
- Operações com Git
- Instalação de pacotes
- Automação de tarefas

### 🔑 Funcionalidades Principais

#### **Execução de Comandos**
- Suporta comandos simples e complexos
- Permite encadeamento com \`&&\`, \`||\`, \`;\`
- Suporta pipes (\`|\`)
- Timeout configurável (padrão: 30 segundos, máx: minutos)
- Execução em background para comandos longos

#### **Segurança**
- **Sandbox Mode**: Restrições de acesso a arquivos e rede
- **Validação de comandos destrutivos**: Aviso antes de executar comandos perigosos
- **Modo somente leitura**: Valida se comando modifica o sistema
- **Permissões granulares**: Controle fino sobre o que pode ser executado
- **Validação de paths**: Previne acesso a arquivos sensíveis

#### **Comandos Especiais Detectados**
- **Comandos de busca**: find, grep, rg, ag, locate
- **Comandos de leitura**: cat, head, tail, less, wc, stat
- **Comandos de listagem**: ls, tree, du
- **Comandos silenciosos**: mv, cp, rm, mkdir, chmod
- **Comandos destrutivos**: git reset --hard, rm -rf, etc.

### 📝 Como Usar

#### Exemplo 1: Comando Simples
\`\`\`typescript
{
  tool: "BashTool",
  input: {
    command: "ls -la /home/user/projects"
  }
}
\`\`\`

#### Exemplo 2: Comandos Encadeados
\`\`\`typescript
{
  tool: "BashTool",
  input: {
    command: "cd /projeto && npm install && npm test"
  }
}
\`\`\`

#### Exemplo 3: Com Timeout Customizado
\`\`\`typescript
{
  tool: "BashTool",
  input: {
    command: "python train_model.py",
    timeout_ms: 600000  // 10 minutos
  }
}
\`\`\`

#### Exemplo 4: Execução em Background
\`\`\`typescript
{
  tool: "BashTool",
  input: {
    command: "npm run dev",
    run_in_background: true
  }
}
\`\`\`

### 🔒 Validações de Segurança

#### **1. Comandos Destrutivos**
Comandos como \`rm -rf\`, \`git reset --hard\`, \`git push --force\` disparam avisos.

#### **2. Sandbox (se habilitado)**
\`\`\`json
{
  "filesystem": {
    "read": {
      "denyOnly": ["/etc/passwd", "~/.ssh/*"]
    },
    "write": {
      "allowOnly": ["/tmp", "~/projects"]
    }
  },
  "network": {
    "allowedHosts": ["api.example.com"],
    "deniedHosts": ["*.internal.corp"]
  }
}
\`\`\`

### 📦 Arquivos Principais

| Arquivo | Função |
|---------|--------|
| \`BashTool.tsx\` | Componente principal |
| \`bashSecurity.ts\` | Validações de segurança |
| \`bashPermissions.ts\` | Sistema de permissões |
| \`sedEditParser.ts\` | Parser para comandos sed |
| \`commandSemantics.ts\` | Interpretação de comandos |
| \`shouldUseSandbox.ts\` | Lógica de sandbox |

---

## 2️⃣ PowerShellTool - Execução de Comandos PowerShell

### 📋 O que é?
Ferramenta para executar comandos PowerShell em sistemas Windows. Equivalente ao BashTool, mas otimizado para o ecossistema Windows.

### 🎯 Para que serve?
- Executar cmdlets do PowerShell
- Gerenciar sistema Windows
- Automação administrativa
- Scripts PowerShell
- Manipulação de objetos .NET
- Gerenciamento de serviços Windows

### 🔑 Funcionalidades Principais

#### **Comandos PowerShell**
- Suporta cmdlets (Get-Content, Set-Item, etc.)
- Aliases nativos (ls, cat, cd)
- Pipelines de objetos
- Scripts .ps1
- Modo CLM (Constrained Language Mode) para segurança

#### **Segurança PowerShell**
- **CLM Types**: Tipos de restrição de linguagem
- **Execution Policy**: Validação de políticas
- **Git Safety**: Proteção para operações Git
- **Read-only validation**: Detecta comandos que modificam o sistema

### 📝 Como Usar

#### Exemplo 1: Listar Processos
\`\`\`typescript
{
  tool: "PowerShellTool",
  input: {
    command: "Get-Process | Where-Object CPU -gt 100"
  }
}
\`\`\`

#### Exemplo 2: Gerenciar Serviços
\`\`\`typescript
{
  tool: "PowerShellTool",
  input: {
    command: "Get-Service | Where-Object Status -eq 'Running'"
  }
}
\`\`\`

### 📦 Arquivos Principais

| Arquivo | Função |
|---------|--------|
| \`PowerShellTool.tsx\` | Componente principal |
| \`powershellSecurity.ts\` | Segurança PowerShell |
| \`clmTypes.ts\` | Constrained Language Mode |
| \`commonParameters.ts\` | Parâmetros comuns |
| \`gitSafety.ts\` | Segurança Git |

---

## 3️⃣ REPLTool - Ambiente REPL Interativo

### 📋 O que é?
REPL (Read-Eval-Print Loop) é um ambiente interativo que permite executar código e ver resultados imediatamente. Pensa nele como um "modo desenvolvedor" onde ferramentas primitivas ficam disponíveis.

### 🎯 Para que serve?
- Desenvolvimento e testes rápidos
- Experimentação com código
- Debug interativo
- Prototipagem rápida

### 🔑 Funcionalidades

O REPL agrupa as seguintes ferramentas primitivas:
- FileReadTool
- FileWriteTool
- FileEditTool
- GlobTool
- GrepTool
- BashTool
- NotebookEditTool
- AgentTool

### 📦 Arquivos

| Arquivo | Função |
|---------|--------|
| \`REPLTool.ts\` | Tool stub (placeholder) |
| \`primitiveTools.ts\` | Lista de ferramentas primitivas |
| \`constants.ts\` | Constantes do REPL |

---

# 📁 CATEGORIA 2: MANIPULAÇÃO DE ARQUIVOS

## 4️⃣ FileReadTool - Leitura de Arquivos

### 📋 O que é?
Ferramenta especializada para ler arquivos do sistema. Suporta texto, imagens, PDFs e notebooks Jupyter.

### 🎯 Para que serve?
- Ler conteúdo de arquivos
- Visualizar código-fonte
- Extrair informações de documentos
- Processar imagens
- Ler notebooks Jupyter
- Leitura parcial (offset e limite de linhas)

### 🔑 Funcionalidades Principais

#### **Tipos de Arquivo Suportados**
- **Texto**: .txt, .md, .json, .yaml, código-fonte
- **Imagens**: .jpg, .png, .gif, .webp
- **PDFs**: Extração de texto e páginas
- **Notebooks**: .ipynb (Jupyter)
- **Binários**: Detecção automática

#### **Recursos Avançados**
- **Line Numbers**: Numeração de linhas automática
- **Offset/Limit**: Leitura de intervalos específicos
- **Encoding Detection**: Detecta encoding automaticamente
- **Image Resizing**: Redimensiona imagens grandes
- **PDF Page Selection**: Seleciona páginas específicas

### 📝 Como Usar

#### Exemplo 1: Ler Arquivo Completo
\`\`\`typescript
{
  tool: "FileReadTool",
  input: {
    path: "/home/user/projeto/app.py"
  }
}
\`\`\`

#### Exemplo 2: Ler Linhas Específicas
\`\`\`typescript
{
  tool: "FileReadTool",
  input: {
    path: "/home/user/data.txt",
    offset: 100,   // Começar da linha 100
    limit: 50      // Ler 50 linhas
  }
}
\`\`\`

#### Exemplo 3: Ler Páginas de PDF
\`\`\`typescript
{
  tool: "FileReadTool",
  input: {
    path: "/docs/manual.pdf",
    pdf_pages: "1-5,10"  // Páginas 1 a 5 e página 10
  }
}
\`\`\`

#### Exemplo 4: Ler Imagem
\`\`\`typescript
{
  tool: "FileReadTool",
  input: {
    path: "/images/screenshot.png"
  }
}
// Retorna: imagem processada e metadados
\`\`\`

### 🔒 Limites e Segurança

\`\`\`typescript
const LIMITS = {
  MAX_FILE_SIZE: 100_MB,  // Tamanho máximo
  MAX_LINES: 50_000,      // Máximo de linhas
  PDF_MAX_PAGES: 100,     // Páginas de PDF
  IMAGE_MAX_TOKENS: 1568  // Tokens de imagem
}
\`\`\`

### 📦 Arquivos Principais

| Arquivo | Função |
|---------|--------|
| \`FileReadTool.ts\` | Implementação principal |
| \`imageProcessor.ts\` | Processamento de imagens |
| \`limits.ts\` | Limites de leitura |
| \`prompt.ts\` | Instruções para IA |
| \`UI.tsx\` | Interface do usuário |

---

## 5️⃣ FileWriteTool - Criação e Escrita de Arquivos

### 📋 O que é?
Ferramenta para criar novos arquivos ou sobrescrever arquivos existentes com conteúdo completo.

### 🎯 Para que serve?
- Criar novos arquivos
- Sobrescrever arquivos existentes
- Gerar arquivos de configuração
- Criar scripts
- Salvar resultados processados

### ⚠️ Importante
**Esta ferramenta SOBRESCREVE** o arquivo se ele já existir. Para editar arquivos existentes, use **FileEditTool**.

### 📝 Como Usar

#### Exemplo 1: Criar Novo Arquivo
\`\`\`typescript
{
  tool: "FileWriteTool",
  input: {
    path: "/projeto/config.json",
    contents: '{\n  "port": 3000,\n  "host": "localhost"\n}'
  }
}
\`\`\`

#### Exemplo 2: Criar Script
\`\`\`typescript
{
  tool: "FileWriteTool",
  input: {
    path: "/scripts/deploy.sh",
    contents: "#!/bin/bash\necho 'Deploying...'\ngit push origin main"
  }
}
\`\`\`

### 🔒 Validações

- Verifica permissões de escrita
- Valida se diretório pai existe
- Detecta arquivos sensíveis (.env, credentials)
- Rastreamento de histórico de arquivos
- Notifica LSP de mudanças

### 📦 Arquivos

| Arquivo | Função |
|---------|--------|
| \`FileWriteTool.ts\` | Implementação |
| \`prompt.ts\` | Instruções |
| \`UI.tsx\` | Interface |

---

## 6️⃣ FileEditTool - Edição de Arquivos

### 📋 O que é?
Ferramenta para editar arquivos existentes fazendo substituições de string exatas. É a ferramenta mais usada para modificar código.

### 🎯 Para que serve?
- Editar código-fonte
- Corrigir bugs
- Adicionar funcionalidades
- Refatorar código
- Renomear variáveis/funções

### 🔑 Funcionalidades Principais

#### **Substituição Exata**
- Busca por string exata (\`old_string\`)
- Substitui por nova string (\`new_string\`)
- Falha se \`old_string\` não for único
- Opção \`replace_all\` para múltiplas ocorrências

#### **Validações**
- **Deve ler o arquivo primeiro** com FileReadTool
- Preserva indentação original
- Detecta modificações concorrentes
- Valida unicidade da string

### 📝 Como Usar

#### ✅ Exemplo CORRETO: Edição com Contexto
\`\`\`typescript
// 1. Primeiro, LER o arquivo
{
  tool: "FileReadTool",
  input: { path: "/app/server.js" }
}

// 2. Depois, EDITAR
{
  tool: "FileEditTool",
  input: {
    path: "/app/server.js",
    old_string: "const port = 3000;\napp.listen(port);",
    new_string: "const port = process.env.PORT || 3000;\napp.listen(port);"
  }
}
\`\`\`

#### ❌ Exemplo ERRADO: Edição sem Ler
\`\`\`typescript
// ERRO: Não leu o arquivo antes!
{
  tool: "FileEditTool",
  input: {
    path: "/app/server.js",
    old_string: "const port = 3000;",
    new_string: "const port = 8080;"
  }
}
// Resultado: ERRO - "Must read file first"
\`\`\`

#### Exemplo: Replace All (Renomear Variável)
\`\`\`typescript
{
  tool: "FileEditTool",
  input: {
    path: "/app/utils.js",
    old_string: "oldVariableName",
    new_string: "newVariableName",
    replace_all: true  // Substitui todas as ocorrências
  }
}
\`\`\`

### 🎯 Dicas de Uso

1. **Sempre leia o arquivo primeiro** com FileReadTool
2. **Use contexto suficiente** no \`old_string\` (2-4 linhas adjacentes)
3. **Preserve a indentação** exatamente como está
4. **Não inclua números de linha** no old_string
5. **Use replace_all** para renomear variáveis

### ⚠️ Erros Comuns

#### Erro 1: String Não Única
\`\`\`
Erro: "old_string appears 3 times in file"
Solução: Adicione mais contexto ao old_string
\`\`\`

#### Erro 2: String Não Encontrada
\`\`\`
Erro: "old_string not found in file"
Solução: Verifique espaços, tabs, indentação
\`\`\`

#### Erro 3: Não Leu o Arquivo
\`\`\`
Erro: "Must read file before editing"
Solução: Use FileReadTool primeiro
\`\`\`

### 📦 Arquivos Principais

| Arquivo | Função |
|---------|--------|
| \`FileEditTool.ts\` | Implementação |
| \`utils.ts\` | Utilitários de edição |
| \`types.ts\` | Tipos TypeScript |
| \`constants.ts\` | Constantes |
| \`prompt.ts\` | Instruções |
| \`UI.tsx\` | Interface |

---

## 7️⃣ GlobTool - Busca de Arquivos por Padrão

### 📋 O que é?
Ferramenta para encontrar arquivos usando padrões glob (wildcards). Equivalente ao comando \`find\` mas mais rápido e seguro.

### 🎯 Para que serve?
- Encontrar arquivos por nome
- Buscar por extensão
- Localizar arquivos em diretórios
- Filtrar por padrões complexos

### 🔑 Padrões Glob Suportados

| Padrão | Significado | Exemplo |
|--------|-------------|---------|
| \`*\` | Qualquer caractere (exceto /) | \`*.js\` = todos .js |
| \`**\` | Qualquer diretório (recursivo) | \`**/*.ts\` = .ts em qualquer lugar |
| \`?\` | Um caractere qualquer | \`file?.txt\` |
| \`[abc]\` | Um dos caracteres | \`file[123].txt\` |
| \`{a,b}\` | Alternativas | \`*.{js,ts}\` |

### 📝 Como Usar

#### Exemplo 1: Buscar por Extensão
\`\`\`typescript
{
  tool: "GlobTool",
  input: {
    pattern: "*.py"  // Todos arquivos .py no diretório atual
  }
}
\`\`\`

#### Exemplo 2: Busca Recursiva
\`\`\`typescript
{
  tool: "GlobTool",
  input: {
    pattern: "**/*.tsx"  // Todos .tsx em qualquer subdiretório
  }
}
\`\`\`

#### Exemplo 3: Múltiplas Extensões
\`\`\`typescript
{
  tool: "GlobTool",
  input: {
    pattern: "**/*.{js,ts,jsx,tsx}"  // Arquivos JS/TS
  }
}
\`\`\`

#### Exemplo 4: Em Diretório Específico
\`\`\`typescript
{
  tool: "GlobTool",
  input: {
    pattern: "*.test.js",
    path: "/projeto/tests"  // Buscar apenas em /projeto/tests
  }
}
\`\`\`

### 📊 Saída

\`\`\`typescript
{
  durationMs: 145,
  numFiles: 23,
  filenames: [
    "/projeto/src/app.tsx",
    "/projeto/src/components/Button.tsx",
    // ...
  ],
  truncated: false
}
\`\`\`

### ⚡ Performance

- Limite: 100 arquivos
- Ordenação por data de modificação (mais recentes primeiro)
- Otimizado para grandes repositórios

### 📦 Arquivos

| Arquivo | Função |
|---------|--------|
| \`GlobTool.ts\` | Implementação |
| \`prompt.ts\` | Instruções |
| \`UI.tsx\` | Interface |

---

## 8️⃣ NotebookEditTool - Edição de Notebooks Jupyter

### 📋 O que é?
Ferramenta especializada para editar células de notebooks Jupyter (.ipynb).

### 🎯 Para que serve?
- Editar células de código Python
- Modificar células Markdown
- Criar novas células
- Atualizar notebooks existentes

### 🔑 Funcionalidades

#### **Operações Suportadas**
- ✏️ Editar célula existente (\`is_new_cell: false\`)
- ➕ Criar nova célula (\`is_new_cell: true\`)
- 🗑️ Deletar conteúdo de célula (new_string vazio)

#### **Tipos de Célula**
- \`python\` - Código Python
- \`markdown\` - Documentação
- \`javascript\`, \`typescript\`
- \`r\`, \`sql\`, \`shell\`
- \`raw\` - Texto puro

### 📝 Como Usar

#### Exemplo 1: Editar Célula Existente
\`\`\`typescript
{
  tool: "NotebookEditTool",
  input: {
    target_notebook: "/projeto/analysis.ipynb",
    cell_idx: 0,  // Primeira célula
    is_new_cell: false,
    cell_language: "python",
    old_string: "import pandas as pd\ndf = pd.read_csv('data.csv')",
    new_string: "import pandas as pd\nimport numpy as np\ndf = pd.read_csv('data.csv')"
  }
}
\`\`\`

#### Exemplo 2: Criar Nova Célula
\`\`\`typescript
{
  tool: "NotebookEditTool",
  input: {
    target_notebook: "/projeto/analysis.ipynb",
    cell_idx: 1,  // Inserir na posição 1
    is_new_cell: true,
    cell_language: "python",
    old_string: "",  // Vazio para nova célula
    new_string: "# Nova análise\nprint('Hello, World!')"
  }
}
\`\`\`

#### Exemplo 3: Adicionar Markdown
\`\`\`typescript
{
  tool: "NotebookEditTool",
  input: {
    target_notebook: "/docs/tutorial.ipynb",
    cell_idx: 0,
    is_new_cell: true,
    cell_language: "markdown",
    old_string: "",
    new_string: "# Tutorial de Análise de Dados\n\nEste notebook demonstra..."
  }
}
\`\`\`

### ⚠️ Importante

1. **Células são indexadas de 0** (zero-based)
2. **old_string deve ser único** na célula
3. **Inclua 3-5 linhas de contexto** no old_string
4. **Não inclua sintaxe JSON** do notebook
5. **is_new_cell deve ser correto** (true/false)

### 📦 Arquivos

| Arquivo | Função |
|---------|--------|
| \`NotebookEditTool.ts\` | Implementação |
| \`constants.ts\` | Constantes |
| \`prompt.ts\` | Instruções |
| \`UI.tsx\` | Interface |

---

# 🔐 SEGURANÇA GERAL

## Princípios de Segurança

### 1. **Princípio do Menor Privilégio**
Cada tool tem apenas as permissões necessárias para sua função.

### 2. **Validação em Camadas**
- Validação de entrada
- Permissões de usuário
- Sandbox (se habilitado)
- Validação de saída

### 3. **Proteção de Arquivos Sensíveis**
\`\`\`
Bloqueados por padrão:
- ~/.ssh/*
- ~/.aws/*
- .env, .env.*
- **/credentials.json
- ~/.gnupg/*
\`\`\`

### 4. **Comandos Destrutivos**
Aviso obrigatório antes de executar:
- \`rm -rf\`
- \`git reset --hard\`
- \`git push --force\`
- \`DROP TABLE\`
- \`DELETE FROM\` (sem WHERE)

---

# 📊 COMPARAÇÃO DAS TOOLS

| Tool | Leitura | Escrita | Execução | Plataforma |
|------|---------|---------|----------|------------|
| BashTool | ✅ | ✅ | ✅ | Unix/Linux/macOS |
| PowerShellTool | ✅ | ✅ | ✅ | Windows |
| REPLTool | ✅ | ✅ | ✅ | Multiplataforma |
| FileReadTool | ✅ | ❌ | ❌ | Multiplataforma |
| FileWriteTool | ❌ | ✅ | ❌ | Multiplataforma |
| FileEditTool | ✅ | ✅ | ❌ | Multiplataforma |
| GlobTool | ✅ | ❌ | ❌ | Multiplataforma |
| NotebookEditTool | ✅ | ✅ | ❌ | Multiplataforma |

---

# 🎓 CASOS DE USO COMUNS

## Caso 1: Ler e Modificar Código

\`\`\`typescript
// 1. Buscar arquivo
{ tool: "GlobTool", input: { pattern: "**/server.js" } }

// 2. Ler arquivo
{ tool: "FileReadTool", input: { path: "/app/server.js" } }

// 3. Editar arquivo
{ 
  tool: "FileEditTool",
  input: {
    path: "/app/server.js",
    old_string: "const port = 3000;",
    new_string: "const port = process.env.PORT || 3000;"
  }
}
\`\`\`

## Caso 2: Executar Testes

\`\`\`typescript
// 1. Navegar para diretório e executar
{
  tool: "BashTool",
  input: {
    command: "cd /projeto && npm test"
  }
}
\`\`\`

## Caso 3: Criar Projeto Node.js

\`\`\`typescript
// 1. Criar diretório
{ tool: "BashTool", input: { command: "mkdir -p /projetos/meu-app" } }

// 2. Criar package.json
{
  tool: "FileWriteTool",
  input: {
    path: "/projetos/meu-app/package.json",
    contents: '{\n  "name": "meu-app",\n  "version": "1.0.0"\n}'
  }
}

// 3. Instalar dependências
{ tool: "BashTool", input: { command: "cd /projetos/meu-app && npm install express" } }
\`\`\`

## Caso 4: Análise de Dados com Notebook

\`\`\`typescript
// 1. Criar novo notebook
{ tool: "FileWriteTool", input: { path: "/analise.ipynb", contents: "{...}" } }

// 2. Adicionar célula de código
{
  tool: "NotebookEditTool",
  input: {
    target_notebook: "/analise.ipynb",
    cell_idx: 0,
    is_new_cell: true,
    cell_language: "python",
    new_string: "import pandas as pd\ndf = pd.read_csv('dados.csv')"
  }
}
\`\`\`

---

# 🔧 ARQUITETURA TÉCNICA

## Estrutura de Uma Tool

Cada tool segue este padrão:

\`\`\`typescript
export const MyTool = buildTool({
  name: "MyTool",
  description: "O que a tool faz",
  inputSchema: z.object({...}),
  outputSchema: z.object({...}),
  
  async execute(input, context) {
    // 1. Validação
    // 2. Verificação de permissões
    // 3. Execução
    // 4. Retorno de resultado
  },
  
  // Metadados
  isReadOnly: () => boolean,
  isConcurrencySafe: () => boolean,
  userFacingName: "Nome Amigável",
  getToolUseSummary: (input) => string
})
\`\`\`

## Fluxo de Execução

\`\`\`
┌─────────────┐
│   Usuário   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   IA (Claude)   │
└──────┬──────────┘
       │
       ▼
┌─────────────────────┐
│   Tool Executor     │
│  - Validação input  │
│  - Permissões       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Tool Específica   │
│  - BashTool         │
│  - FileEditTool     │
│  - etc.             │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Sandbox (opt)     │
│  - Filesystem       │
│  - Network          │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Sistema Op.       │
│  - Filesystem       │
│  - Shell            │
└─────────────────────┘
\`\`\`

---

# 📚 REFERÊNCIAS E RECURSOS

## Documentação Relacionada
- \`README.md\` - Visão geral simplificada
- Código-fonte em \`src/tools/\`
- Testes em \`*.test.ts\`

## Glossário

- **Tool**: Ferramenta que o assistente de IA pode usar
- **Sandbox**: Ambiente isolado de execução
- **CLM**: Constrained Language Mode (PowerShell)
- **Glob**: Padrão de busca com wildcards
- **REPL**: Read-Eval-Print Loop
- **stdin/stdout**: Entrada/saída padrão
- **Pipe**: Conectar saída de um comando à entrada de outro

---

# 🎯 MELHORES PRÁTICAS

## ✅ DO (Faça)

1. **Sempre leia antes de editar** arquivos
2. **Use GlobTool** antes de FileReadTool quando não sabe o caminho
3. **Prefira FileEditTool** a criar arquivo novo
4. **Use contexto suficiente** em old_string (2-4 linhas)
5. **Valide permissões** antes de operações sensíveis
6. **Use sandbox** em ambientes de produção
7. **Trate erros** adequadamente

## ❌ DON'T (Não Faça)

1. ❌ Não use FileWriteTool para editar arquivos existentes
2. ❌ Não ignore avisos de comandos destrutivos
3. ❌ Não execute comandos sem entender o que fazem
4. ❌ Não desabilite sandbox sem necessidade
5. ❌ Não inclua números de linha em old_string
6. ❌ Não use cat/sed/awk quando há tool específica
7. ❌ Não execute scripts não confiáveis

---

# 📞 SUPORTE E CONTRIBUIÇÃO

## Estrutura do Projeto Original

\`\`\`
openclaude/
├── src/
│   ├── tools/
│   │   ├── BashTool/
│   │   ├── PowerShellTool/
│   │   ├── FileReadTool/
│   │   └── ...
│   └── ...
└── ...
\`\`\`

## Desenvolvimento

Para adicionar uma nova tool:

1. Criar pasta em \`src/tools/NomeDaTool/\`
2. Implementar \`NomeDaTool.ts\`
3. Adicionar prompts, UI, validações
4. Testes em \`*.test.ts\`
5. Atualizar documentação

---

**Versão da Documentação**: 1.0  
**Última Atualização**: 10 de maio de 2026  
**Total de Tools Documentadas**: 8  
**Total de Arquivos**: 58

🎉 **Documentação Completa das Odin Tools CLI!**
