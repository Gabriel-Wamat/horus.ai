# Spec de refatoracao: multiprovider LLM persistente

Versao: 1.0.0
Status: aprovado para implementacao
Escopo: configuracao de provider/modelo/chave para todos os fluxos LLM do Horus

## Historico de versoes

- `1.0.0` - baseline auditado e congelado para implementacao inicial da persistencia multiprovider.

## 1. Veredito da auditoria atual

A feature de multiprovider existe, mas ainda nao esta bem fechada. Hoje o usuario consegue preencher provider, modelo e API key no modal, e esse payload pode chegar ao fluxo principal de `workflow/start`. Isso nao significa persistencia real.

O estado atual e:

- A chave fica somente em estado React em `apps/web/src/app/useWorkflowRuntime.ts`.
- O modal em `apps/web/src/components/LlmSettingsModal.tsx` repopula a chave a partir desse estado em memoria.
- O frontend envia `llmSettings` apenas em `workflowApi.start(...)`, em `apps/web/src/api/workflowApi.ts`.
- O backend guarda `llmSettings` em um `Map` em memoria por `threadId`, em `apps/server/src/infrastructure/llm/runtimeLlmSettings.ts`.
- O `Map` e perdido em reload do servidor, restart do processo, troca de instancia ou retomada apos queda.
- O backend limpa a configuracao runtime ao terminar ou falhar o workflow em `WorkflowOrchestrator`.
- `StartProjectConstructionInputSchema` nao aceita `llmSettings`.
- `HorusChatTurnInputSchema` nao aceita `llmSettings`.
- `HorusChatAgentImpl` e `HorusOdinIntentRouter` criam modelos `horus` sem receber configuracao runtime.
- Nao existe rota para salvar, testar, listar ou apagar provider configurado.
- Nao existe persistencia redigida nem armazenamento seguro de segredo.
- Nao existe teste de conexao antes de salvar.

Conclusao: se o usuario inserir a chave hoje, ela pode funcionar apenas para um run iniciado imediatamente via `workflow/start`, enquanto a pagina e o servidor permanecem vivos. Ela nao esta persistente, nao cobre todos os fluxos e nao tem garantia operacional suficiente.

## 2. Objetivo da refatoracao

Implementar uma configuracao multiprovider persistente, segura e reutilizavel em todos os pontos que chamam LLM:

- Spec Agent
- Front Agent
- QA Agent
- Curator Agent
- Horus Chat Agent
- Horus Odin Intent Router
- Project construction workflows
- workflows retomados depois de reload/restart, quando houver perfil persistido

O usuario deve conseguir salvar uma configuracao, validar a conexao, recarregar a pagina, iniciar outro fluxo e continuar usando o mesmo provider sem reinserir a chave.

## 3. Principios obrigatorios

- Nunca persistir API key em `localStorage`, `sessionStorage`, IndexedDB ou estado serializado do frontend.
- Nunca retornar API key crua para o frontend depois do save.
- Nunca gravar chave em eventos SSE, snapshots de workflow, timeline, logs de erro, artefatos de workspace ou payloads de chat.
- Persistir no frontend apenas estado redigido: provider, modelo, status de validacao, fingerprint/last4 e timestamps.
- Resolver a configuracao LLM no backend por perfil salvo, nao por envio repetido da chave em toda chamada.
- Manter fallback por env vars para desenvolvimento e CI.
- Permitir modo "sessao atual" explicitamente, mas sinalizado como nao persistente.
- Usar registro de provider/capabilities para evitar hardcode espalhado na UI.

## 4. Modelo alvo

### 4.1 Schemas compartilhados

Adicionar entidades em `packages/shared/src/entities/LlmSettings.ts`:

```ts
export const LlmProviderSchema = z.enum(["openai", "openrouter", "groq"]);

export const LlmProviderCapabilitySchema = z.object({
  provider: LlmProviderSchema,
  label: z.string(),
  defaultBaseUrl: z.string().url(),
  supportsStructuredOutput: z.boolean(),
  supportsResponsesApi: z.boolean(),
  defaultModels: z.array(z.string()),
});

export const LlmSettingsDraftSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.string().url().optional(),
  persistenceMode: z.enum(["persisted", "session"]).default("persisted"),
});

export const LlmSettingsProfileSchema = z.object({
  id: z.string().uuid(),
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().url(),
  keyLast4: z.string().min(4).max(8).optional(),
  keyFingerprint: z.string().min(12).optional(),
  validationStatus: z.enum(["untested", "valid", "invalid"]),
  validationMessage: z.string().optional(),
  validatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const LlmSettingsReferenceSchema = z.object({
  profileId: z.string().uuid().optional(),
  sessionSettings: LlmSettingsDraftSchema.optional(),
});
```

`LlmSettings` atual deve continuar existindo durante a migracao, mas o contrato final dos fluxos deve usar `LlmSettingsReference`, nao carregar chave crua em snapshots.

### 4.2 Store de credenciais

Criar uma abstracao no backend:

```ts
export interface LlmCredentialStore {
  getDefaultProfile(): Promise<LlmSettingsProfile | null>;
  saveProfile(input: SaveLlmProfileInput): Promise<LlmSettingsProfile>;
  resolveSecret(profileId: string): Promise<ResolvedLlmSecret>;
  deleteProfile(profileId: string): Promise<void>;
}
```

Implementacao local minima:

- `FileLlmCredentialStore`
- metadados em `.horus/data/llm/profiles.json`
- segredo criptografado em `.horus/data/llm/secrets.json`
- chave de criptografia derivada de `HORUS_SECRET_KEY`
- se `HORUS_SECRET_KEY` nao existir, permitir apenas modo `session` ou falhar com erro claro ao tentar persistir
- writes atomicos seguindo a direcao de `docs/local-persistence-plan.md`

Importante: se ainda nao houver uma camada robusta de criptografia pronta, a primeira entrega deve bloquear persistencia de chave em arquivo e oferecer somente `session` com aviso. Nao aceitar pseudo-seguranca.

### 4.3 Resolver unico de LLM

Criar `LlmSettingsResolver`:

```ts
export interface LlmSettingsResolver {
  resolve(input: {
    role: AgentRole;
    requestSettings?: LlmSettingsReference;
    threadId?: string;
  }): Promise<AgentModelConfig>;
}
```

Ordem de precedencia:

1. `requestSettings.sessionSettings`, quando informado explicitamente.
2. `requestSettings.profileId`, resolvido no `LlmCredentialStore`.
3. Perfil default persistido.
4. Configuracao por env do role, como `SPEC_AGENT_MODEL`.
5. Configuracao global por env, como `LLM_MODEL`.

O estado do workflow deve salvar apenas `llmProfileId`, `llmProvider`, `llmModel` e fingerprint redigido. A API key nunca entra em `WorkflowState`.

## 5. API alvo

Adicionar rotas:

### `GET /api/llm/providers`

Retorna providers disponiveis, defaults e capacidades.

### `GET /api/llm/settings`

Retorna o perfil default redigido:

```json
{
  "profile": {
    "id": "...",
    "provider": "openai",
    "model": "gpt-5-mini",
    "baseUrl": "https://api.openai.com/v1",
    "keyLast4": "...",
    "validationStatus": "valid"
  }
}
```

### `PUT /api/llm/settings`

Salva provider/modelo/chave. Quando `apiKey` vier vazio e ja existir perfil, mantem a chave atual e atualiza somente provider/modelo/baseUrl se isso for permitido pela validacao.

### `POST /api/llm/settings/test`

Testa a configuracao sem persistir. Deve fazer uma chamada minima e barata ao provider, com timeout curto.

Requisitos:

- confirmar autenticacao
- confirmar modelo
- confirmar suporte ao modo usado pelos agentes
- retornar erro legivel sem expor segredo

### `DELETE /api/llm/settings`

Remove perfil persistido e segredo associado.

### Alterar rotas existentes

`POST /api/workflow/start`:

- aceitar `llmSettingsRef`
- manter `llmSettings` temporariamente como compat, convertendo para `sessionSettings`

`POST /api/project-construction/runs`:

- aceitar `llmSettingsRef`
- repassar ao workflow starter

`POST /api/chat/turn` e `POST /api/chat/turn/stream`:

- aceitar `llmSettingsRef` ou usar perfil default salvo
- repassar ao `SubmitHorusChatTurnUseCase`

## 6. Integracao backend

### Pontos que devem passar pelo resolver

- `SpecAgentImpl`
- `FrontAgentImpl`
- `QaAgentImpl`
- `CuratorAgentImpl`
- `HorusChatAgentImpl`
- `LlmHorusIntentClassifier`
- `WorkflowOrchestrator.start`
- `WorkflowOrchestrator.startChatCodeChange`
- `WorkflowOrchestrator.startSpecGeneration`
- `StartProjectConstructionUseCase`
- `SubmitHorusChatTurnUseCase`

### Ajuste em `providerConfig`

`resolveAgentModelConfig(...)` deve deixar de aceitar diretamente chave crua como runtime comum. Ele deve receber uma configuracao ja resolvida pelo resolver, ou continuar existindo apenas como fallback env.

O `baseUrl` tambem deve ser parte do perfil persistido. Hoje runtime provider/model/key podem sobrescrever env, mas `baseUrl` ainda vem de env/default.

### Persistencia por workflow

Ao iniciar workflow:

- resolver o perfil
- validar que a chave existe
- salvar no snapshot apenas `llmProfileId`, `llmProvider`, `llmModel`, `llmKeyFingerprint`

Ao retomar workflow:

- usar `llmProfileId` salvo para recuperar segredo
- se o perfil foi apagado, falhar com erro acionavel: "Configure novamente o provider LLM para retomar este workflow"

## 7. Frontend alvo

### Boot

No carregamento do app:

- buscar `GET /api/llm/settings`
- preencher status global `llm`
- manter no estado somente perfil redigido

### Modal

O modal deve:

- mostrar provider, modelo, base URL avancada e status da chave
- exibir `keyLast4` quando existir chave salva
- deixar campo de chave vazio por padrao quando ja houver segredo salvo
- interpretar campo vazio como "manter chave atual"
- ter acao "Testar conexao"
- bloquear "Salvar persistente" se o teste falhar, exceto se o usuario escolher "Salvar sem testar" explicitamente
- oferecer "Remover chave"
- exibir erro por provider/modelo sem expor resposta bruta com segredo

### Status shell

O chip `llm` deve diferenciar:

- `env`
- `openai valid`
- `openrouter untested`
- `groq invalid`
- `session`

Nunca mostrar parte sensivel da chave no header.

### Chamadas de fluxo

`workflowApi.start(...)`, `workflowApi.startProjectConstruction(...)` e `horusChatApi` devem enviar apenas `llmSettingsRef` quando necessario. No caso normal, podem omitir o campo e deixar o backend usar o perfil default.

## 8. Segurança e redacao

Adicionar helper central:

```ts
redactLlmSettings(value: unknown): unknown
```

Usar em:

- logs de erro das rotas
- eventos SSE
- snapshots de workflow
- timeline de agent-flow
- mensagens de erro retornadas ao frontend
- testes que serializam payloads

Adicionar testes que falham se strings como `sk-`, `gsk_`, `OPENROUTER_API_KEY` ou a chave de fixture aparecerem em:

- resposta de `GET /api/llm/settings`
- eventos SSE
- `WorkflowState`
- arquivos de workspace
- logs capturados em teste

## 9. Testes obrigatorios

### Shared

- schema aceita provider/model/baseUrl/persistenceMode
- schema rejeita provider desconhecido
- perfil redigido nunca contem `apiKey`
- referencia aceita `profileId` ou `sessionSettings`

### Server unit

- resolver usa perfil default persistido quando request nao informa config
- request `sessionSettings` tem precedencia sobre perfil default
- `profileId` tem precedencia sobre env
- env continua funcionando sem perfil
- `baseUrl` custom do perfil e respeitado
- erro de chave ausente e claro e redigido
- profile removido impede resume com mensagem acionavel

### Server routes

- `GET /api/llm/providers`
- `GET /api/llm/settings`
- `PUT /api/llm/settings`
- `POST /api/llm/settings/test`
- `DELETE /api/llm/settings`
- `POST /api/workflow/start` aceita `llmSettingsRef`
- `POST /api/project-construction/runs` repassa `llmSettingsRef`
- `POST /api/chat/turn/stream` usa perfil default

### Agent integration

Com provider falso/stub:

- Spec Agent envia Authorization do perfil salvo
- Front Agent envia Authorization do perfil salvo
- QA Agent envia Authorization do perfil salvo
- Curator Agent envia Authorization do perfil salvo
- Horus Chat Agent envia Authorization do perfil salvo
- Intent Router envia Authorization do perfil salvo
- Project construction inicia workflow com mesmo perfil

### Frontend

- modal carrega perfil redigido no boot
- salvar chama `PUT /api/llm/settings`
- testar chama `POST /api/llm/settings/test`
- campo de chave vazio preserva chave existente
- remover chave chama `DELETE /api/llm/settings`
- reload da pagina mantem provider/model/status
- start workflow nao envia API key crua quando ha perfil persistido

### E2E

Fluxo minimo:

1. Abrir app.
2. Abrir configuracoes.
3. Inserir provider/model/chave fake contra servidor LLM stub.
4. Testar conexao.
5. Salvar.
6. Recarregar pagina.
7. Confirmar chip `llm` com provider salvo.
8. Iniciar user story.
9. Confirmar no stub que Spec/Front/QA/Curator usaram a chave correta.
10. Confirmar que nenhum payload visivel ao frontend contem a chave crua.

## 10. Plano de implementacao

### Fase 1 - Contratos e API redigida

1. Expandir schemas compartilhados de LLM.
2. Adicionar providers/capabilities no backend.
3. Criar rotas `/api/llm/*`.
4. Criar store em memoria para testes e interface definitiva.
5. Atualizar frontend para carregar/salvar/testar configuracao redigida.

### Fase 2 - Resolver unico

1. Criar `LlmSettingsResolver`.
2. Adaptar `createChatModel` ou criar `createResolvedChatModel`.
3. Migrar Spec/Front/QA/Curator para o resolver.
4. Manter compat com env vars.
5. Cobrir com testes unitarios.

### Fase 3 - Cobertura dos fluxos esquecidos

1. Adicionar `llmSettingsRef` em project construction.
2. Adicionar `llmSettingsRef` em Horus chat.
3. Passar resolver para `HorusChatAgentImpl`.
4. Passar resolver para `LlmHorusIntentClassifier`.
5. Adicionar testes de integracao por fluxo.

### Fase 4 - Persistencia segura

1. Implementar `FileLlmCredentialStore`.
2. Integrar com `HORUS_DATA_DIR`.
3. Exigir `HORUS_SECRET_KEY` para persistencia de segredo.
4. Adicionar migracao/backup atomico.
5. Adicionar testes de redacao e corrupcao de arquivo.

### Fase 5 - Resume e observabilidade

1. Persistir `llmProfileId` redigido no snapshot do workflow.
2. Resolver segredo por perfil em resume.
3. Mostrar erros acionaveis na UI.
4. Confirmar que eventos de agent-flow mostram provider/model/status sem segredo.

## 11. Criterios de aceite

- Depois de salvar uma chave, recarregar a pagina mantem provider/model/status.
- O usuario nao precisa reinserir chave para iniciar um novo workflow.
- Project construction usa o mesmo provider salvo.
- Horus chat e preview usam o mesmo provider salvo.
- Resume de workflow usa o perfil persistido quando disponivel.
- Se o perfil persistido for removido, resume falha com mensagem clara.
- Nenhuma resposta API redigida contem `apiKey`.
- Nenhum evento SSE contem API key.
- Nenhum snapshot de workflow contem API key.
- Nenhum log de erro contem API key.
- Teste de conexao detecta chave/modelo invalidos antes do save.
- Env vars continuam funcionando quando nao ha perfil salvo.
- `pnpm --filter @u-build/shared build`, `pnpm --filter @u-build/server test` e `pnpm --filter @u-build/web exec vite build` passam.

## 12. Nao objetivos

- Criar novo provider fora de OpenAI/OpenRouter/Groq nesta refatoracao.
- Persistir varias chaves por usuario com UI multi-conta completa.
- Resolver autenticacao multiusuario.
- Guardar segredo no frontend.
- Misturar configuracao LLM com workspace artifacts.

## 13. Riscos

- Sem `HORUS_SECRET_KEY`, persistir segredo localmente seria inseguro. O sistema deve bloquear ou cair para modo sessao.
- OpenRouter/Groq podem nao suportar todos os modelos com structured output. O teste de conexao deve validar a capacidade usada pelos agentes, nao apenas autenticar.
- A API Responses da OpenAI usada pelo Spec Agent tem contrato diferente dos providers OpenAI-compatible. O resolver deve declarar capability por provider.
- Se a configuracao default for alterada durante um workflow em andamento, o workflow deve continuar preso ao `llmProfileId`/fingerprint original para reprodutibilidade.

## 14. Checklist para revisar antes de implementar

- Confirmar se o projeto aceitara `HORUS_SECRET_KEY` obrigatorio em dev.
- Decidir se o primeiro release permite apenas um perfil default.
- Decidir se modo `session` continua existindo depois da persistencia segura.
- Decidir se `baseUrl` custom fica visivel por padrao ou em secao avancada.
- Criar fixtures de provider stub para nao depender de internet nem de chaves reais nos testes.
