# Frontend Visual Identity

Identidade visual da interface web do Pegasus Financial Analysis Engine.

Este documento define o padrão visual, estrutural e comportamental da UI. Ele deve ser usado para criar, revisar e refatorar telas, componentes e fluxos, mantendo consistência com uma ferramenta operacional técnica, densa e escura.

## 1. Direção Visual

A interface deve parecer uma ferramenta profissional de análise em tempo real:

- escura, técnica e operacional;
- densa, mas organizada;
- sem aparência de landing page;
- sem decoração gratuita;
- com hierarquia clara;
- com ações sempre previsíveis;
- com baixa saturação fora de estados ativos;
- com verde/teal como cor funcional, não decorativa.

A UI deve priorizar leitura, comparação, navegação e ação. Nenhuma tela deve depender de textos explicativos longos para ser compreendida.

## 2. Princípios

### Modularidade Visual

Cada área deve ter função clara:

- sidebar: navegação global;
- topbar: contexto global e status;
- toolbar: ações da tela atual;
- painel: agrupamento funcional;
- lista/tabela/tree: navegação ou comparação;
- inspector/drawer/modal: detalhe secundário.

Não misturar funções dentro do mesmo bloco.

### Densidade Controlada

A interface pode ser densa, mas não poluída.

Regras:

- no máximo 2 níveis principais de informação por região;
- detalhes técnicos devem ir para drawer, tooltip, inspector ou painel expansível;
- status resumido fica visível; logs e JSON ficam ocultáveis;
- evitar repetir a mesma informação em header, card e footer;
- ações primárias devem ser poucas e evidentes.

### Hierarquia

Cada tela precisa ter:

1. contexto atual;
2. ação principal;
3. conteúdo principal;
4. detalhes secundários;
5. telemetria/logs sob demanda.

Se tudo tem o mesmo peso visual, a tela está errada.

## 3. Tokens

```css
:root {
  --bg: #0b0e0c;

  --s1: #14181a;
  --s2: #181d1f;
  --s3: #20262a;
  --s4: #0f1314;

  --bd: #262c30;
  --bd-soft: rgba(148, 163, 184, 0.14);
  --bd-active: rgba(20, 199, 123, 0.28);

  --p: #14c77b;
  --ph: #0fa866;
  --pd: #0e2a1e;
  --spark: #28e98f;

  --t: #f1f4f2;
  --t2: #a4adb3;
  --t3: #6f7a80;
  --t4: #465158;

  --danger: #f0556c;
  --warn: #f0b429;
  --info: #5aa3f0;

  --sidebar-w: 72px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --ease: 140ms ease;
}
```

## 4. Layout Base

### App Shell

```css
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 72% 8%, rgba(20, 199, 123, 0.075), transparent 28%),
    var(--bg);
}
```

Não usar:

- hero;
- orbs;
- bokeh;
- gradientes coloridos grandes;
- cards decorativos.

### Main

```css
.main {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  padding: 24px 28px 28px;
}
```

## 5. Sidebar

A sidebar é navegação global. Ela deve ser compacta, fixa e silenciosa.

### Estrutura

- largura desktop: `72px`;
- posição fixa à esquerda;
- ícones centralizados;
- sem texto visível por padrão;
- tooltip obrigatório;
- settings no rodapé;
- grupos separados por linha sutil.

```css
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 20;
  width: var(--sidebar-w);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-right: 1px solid var(--bd-soft);
  background: linear-gradient(180deg, #151a1c 0%, #101415 100%);
}
```

### Botões da Sidebar

```css
.sidebar-button {
  width: 42px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--t3);
  background: transparent;
  display: grid;
  place-items: center;
  transition: background var(--ease), border-color var(--ease), color var(--ease);
}

.sidebar-button:hover {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.075);
  color: var(--t);
}

.sidebar-button.active {
  border-color: rgba(20, 199, 123, 0.24);
  background: rgba(20, 199, 123, 0.11);
  color: var(--p);
}
```

## 6. Topbar

A topbar mostra identidade, contexto e status global.

Deve conter:

- marca/nome do produto;
- subtítulo curto;
- status técnicos à direita;
- ações globais mínimas.

Não colocar muitos botões na topbar.

```css
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
}
```

## 7. Select / Dropdown

O select é um componente central da identidade. Deve parecer controle técnico, não formulário padrão do browser.

### Select Trigger

```css
.select-trigger {
  height: 36px;
  min-width: 220px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  border: 1px solid var(--bd);
  border-radius: 8px;
  background: var(--s2);
  color: var(--t);
  font-size: 12px;
  font-weight: 700;
}
```

Estados:

```css
.select-trigger:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: #1a2022;
}

.select-trigger:focus-visible,
.select-trigger.open {
  border-color: var(--p);
  box-shadow: 0 0 0 3px rgba(20, 199, 123, 0.12);
}
```

### Select Menu

```css
.select-menu {
  min-width: 240px;
  padding: 6px;
  border: 1px solid var(--bd);
  border-radius: 10px;
  background: #111719;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
}
```

### Select Item

```css
.select-item {
  min-height: 34px;
  padding: 8px 9px;
  border-radius: 7px;
  color: var(--t2);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.select-item:hover {
  background: rgba(255, 255, 255, 0.055);
  color: var(--t);
}

.select-item.active {
  background: rgba(20, 199, 123, 0.1);
  color: var(--p);
}
```

## 8. Segmented Control

Usar para alternar modos dentro da mesma tela.

Exemplos:

- Arquivos / SPEC / User Stories;
- Chat / Execução / Logs;
- Resumo / Detalhes.

```css
.segmented {
  height: 36px;
  padding: 3px;
  display: inline-flex;
  gap: 3px;
  border: 1px solid var(--bd);
  border-radius: 10px;
  background: var(--s2);
}

.segmented button {
  height: 28px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--t3);
  font-size: 11px;
  font-weight: 800;
}

.segmented button.active {
  background: rgba(255, 255, 255, 0.075);
  color: var(--t);
}
```

## 9. Buttons

Regra geral: botão de ação em área principal usa `ícone + texto`.

Exceções:

- sidebar;
- chrome global compacto;
- botões de fechar;
- botões dentro de tabela muito densa.

```css
.action-button {
  height: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 7px;

  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--t2);

  font-size: 12px;
  font-weight: 700;
}
```

### Primary Button

```css
.button-primary {
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(35, 235, 152, 0.58);
  border-radius: 9px;
  background: linear-gradient(180deg, #12b073 0%, #0e9b60 100%);
  color: #06110d;
  font-weight: 800;
}
```

Use somente uma ação primária por região visual.

## 10. Inputs

```css
.input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--bd);
  border-radius: 8px;
  background: var(--s2);
  color: var(--t);
  font-size: 12px;
}

.input::placeholder {
  color: var(--t3);
}

.input:focus {
  border-color: var(--p);
  box-shadow: 0 0 0 3px rgba(20, 199, 123, 0.12);
}
```

## 11. Panels

Panels agrupam uma função. Não devem ser usados como decoração.

```css
.panel {
  border: 1px solid var(--bd);
  border-radius: 12px;
  background: var(--s1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}
```

### Panel Header

```css
.panel-head {
  min-height: 54px;
  padding: 15px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--bd);
}
```

## 12. Status Chips

Usar para status curtos, não para texto longo.

```css
.status-chip {
  height: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 7px;

  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 7px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.035),
    rgba(255, 255, 255, 0.015)
  );
}
```

### Live Dot

```css
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--t3);
  box-shadow: 0 0 0 5px rgba(111, 122, 128, 0.09);
}

.live-dot.running {
  background: var(--p);
  box-shadow: 0 0 0 5px rgba(20, 199, 123, 0.12);
  animation: pulse 1.1s infinite;
}
```

## 13. File / Tree UI

Para exploradores, projetos, specs e documentos.

```css
.tree-panel {
  width: 280px;
  min-width: 240px;
  border: 1px solid var(--bd);
  border-radius: 12px;
  background: var(--s1);
  overflow: hidden;
}
```

### Tree Header

```css
.tree-head {
  height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--bd);
}
```

### Tree Item

```css
.tree-item {
  min-height: 30px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 7px;
  color: var(--t2);
  font-size: 12px;
}

.tree-item:hover {
  background: rgba(255, 255, 255, 0.045);
  color: var(--t);
}

.tree-item.active {
  background: rgba(20, 199, 123, 0.1);
  color: var(--p);
}
```

Regras:

- nomes longos usam ellipsis;
- indentação consistente por nível;
- ícone sempre alinhado;
- não carregar árvore inteira se for grande;
- metadados devem ser discretos.

## 14. Tabs

```css
.tabs {
  height: 38px;
  display: flex;
  border-bottom: 1px solid var(--bd);
  background: var(--s1);
}

.tab {
  height: 38px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-right: 1px solid var(--bd);
  color: var(--t3);
  font-size: 12px;
}

.tab.active {
  background: #0f1314;
  color: var(--t);
}
```

## 15. Sobrecarga de Informação

### Regras Obrigatórias

Não mostrar simultaneamente:

- telemetria completa + logs + JSON + lista + editor na mesma primeira dobra;
- múltiplos blocos repetindo o mesmo status;
- mais de uma ação primária por painel;
- tabelas densas sem filtros;
- cards grandes para valores simples.

### Usar Progressive Disclosure

Detalhes devem ir para:

- drawer;
- inspector;
- accordion;
- tooltip;
- modal técnico;
- painel “detalhes”.

Resumo fica visível. Diagnóstico profundo fica ocultável.

## 16. Tipografia

```css
body {
  font: 14px/1.5 "Inter", system-ui, sans-serif;
}
```

Mono:

```css
.mono {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}
```

Escala:

| Uso | Tamanho | Peso |
|---|---:|---:|
| Body | 14px | 400 |
| UI compacta | 12px | 600 |
| Label técnico | 10px | 800 |
| Panel title | 16-18px | 800 |
| Valor técnico | 12-13px | 700 mono |
| JSON/code | 12px | 400 mono |

Evitar títulos grandes em painéis compactos.

## 17. Espaçamento

Escala oficial:

| Token | Valor | Uso |
|---|---:|---|
| `--space-1` | 4px | micro gaps |
| `--space-2` | 8px | gaps internos |
| `--space-3` | 12px | padding compacto |
| `--space-4` | 14px | gap entre blocos |
| `--space-5` | 18px | padding de painel |
| `--space-6` | 24px | padding de página |
| `--space-7` | 28px | margem desktop |

Não criar espaçamentos aleatórios fora dessa escala sem motivo.

## 18. Do / Don't

### Fazer

- usar sidebar compacta;
- usar selects customizados;
- usar segmented controls para modos;
- esconder detalhes avançados;
- manter ações principais visíveis;
- usar verde para foco, ação e running;
- usar mono para dados técnicos;
- manter bordas finas;
- manter layout denso, alinhado e escaneável.

### Não Fazer

- transformar tela operacional em dashboard marketing;
- usar cards aninhados;
- exibir tudo ao mesmo tempo;
- usar muitos badges competindo entre si;
- usar texto explicativo em excesso;
- criar botões só texto para ações importantes;
- usar gradientes decorativos fortes;
- aumentar tipografia para compensar falta de hierarquia;
- colocar lógica pesada no frontend.

## 19. Checklist de Revisão

Antes de aprovar uma tela:

- [ ] Existe uma ação primária clara?
- [ ] A sidebar está consistente?
- [ ] Selects e inputs usam o mesmo padrão?
- [ ] Estados ativo/hover/focus são visíveis?
- [ ] Há excesso de informação na primeira dobra?
- [ ] Logs/JSON/telemetria são ocultáveis?
- [ ] Textos longos usam ellipsis?
- [ ] Painéis têm função clara?
- [ ] A tela continua legível em 1080px?
- [ ] Verde está sendo usado como estado funcional?
```

Isso aqui já fica bem mais próximo de um **documento de identidade visual de verdade**: define componentes, comportamento, densidade, hierarquia e limites do sistema.