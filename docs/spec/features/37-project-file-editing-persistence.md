---
format_version: "agentic_sdd.v1"
task_id: "37-project-file-editing-persistence"
title: "Real project file write layer"
created_at_utc: "2026-05-26T22:52:12Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "planned"
depends_on:
  - "spec/features/33-project-file-browser-backend.md"
  - "spec/features/34-project-file-browser-frontend.md"
  - "spec/features/35-project-code-intelligence-ast.md"
  - "ID_VISUAL.md"
reference_repos:
  - name: "zup-sdd-agents"
    path: "/Users/wamat/Desktop/zup-sdd-agents"
    finding: "Useful read-only project tree/file viewer patterns; no persistent editor or write endpoint in the code screen."
---

# 1. Original User Request

```yaml
raw_user_request: |
  "O que vale
    aproveitar é a estrutura de leitura segura, resolução de raiz do projeto, polling da árvore, fallback run/path e uso de Monaco. O que precisamos fazer melhor no Horus é
    adicionar uma camada real de escrita: endpoint de save, validação de path, conflito por versão/hash, refresh da árvore, feedback de dirty/saving/saved/error e proteção
    contra sobrescrever arquivo alterado fora do editor.": planeje exatamente uma camada real de escrita com tudo isso que você listou, crie uma spec rigorosamente detalhada para todos esses processos funcionarem
```

# 2. System Interpretation

```yaml
system_translation: |
  Planejar uma camada real de escrita para a tela Arquivos do Horus. A camada deve persistir alterações no disco
  do workspace/projeto correto, usando o mesmo modelo seguro de leitura, mas acrescentando validação de path,
  bloqueio de arquivos sensíveis/binários, controle de concorrência por versão/hash, escrita atômica, refresh
  de árvore/conteúdo e uma UX clara de dirty/saving/saved/error/conflict.

expected_user_visible_result: |
  O usuário abre um arquivo textual, edita naturalmente, vê que há alterações não salvas, salva de forma explícita,
  recebe feedback imediato, e não perde alterações locais se o backend rejeitar a gravação. Se o arquivo mudou fora
  do editor, a UI deve mostrar conflito e oferecer recarregar do disco ou manter a versão local.

expected_engineering_result: |
  Backend, shared schemas e frontend passam a ter um contrato de escrita versionado e testado. A implementação não
  deve copiar a limitação do zup-sdd-agents, que usa Monaco read-only e expõe somente GET para árvore/conteúdo.
```

# 3. Contexto Verificado

```yaml
horus_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  current_feature_surface:
    - "apps/web/src/features/project-files"
    - "apps/web/src/api/projectFilesApi.ts"
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "packages/shared/src/entities/ProjectFiles.ts"
  existing_behavior:
    - "A tela Arquivos já lista projetos, árvore e conteúdo."
    - "A edição no frontend existe como estado local, mas não deve ser considerada persistência."
    - "A árvore/conteúdo devem continuar usando projectId como autoridade, não path absoluto enviado livremente."

zup_sdd_agents_findings:
  useful_patterns:
    - "Resolver raiz por run ativa ou path de projeto."
    - "GET separado para árvore e conteúdo."
    - "Árvore limitada e filtrada."
    - "Path safety com relative_to/root containment."
    - "Bloqueio de arquivos ocultos/sensíveis."
    - "Editor Monaco com language detection por extensão."
  limitations_not_to_copy:
    - "CodeMonacoEditor está readOnly."
    - "Não há onChange de editor."
    - "Não há mutation frontend de save."
    - "Não há endpoint PUT/PATCH/POST para salvar arquivo."
    - "Não há conflito por versão/hash."
    - "Não há escrita atômica, auditoria ou refresh pós-save."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Criar contrato compartilhado para salvar arquivo textual."
    - "Implementar endpoint backend de escrita com validação rígida."
    - "Gerar e validar baseVersion por hash/mtime/size para detectar conflito."
    - "Persistir com escrita atômica no mesmo filesystem do arquivo-alvo."
    - "Atualizar cliente frontend e CodeViewer para salvar, descartar e tratar conflitos."
    - "Invalidar/refazer queries de conteúdo e árvore após save."
    - "Adicionar testes de segurança, conflito, escrita válida e falhas."
    - "Documentar como a camada difere do zup-sdd-agents."
  out_of_scope:
    - "Git commit, stage, branch, diff multiarquivo ou pull request."
    - "Criar, mover, renomear ou deletar arquivos."
    - "Salvar binários."
    - "Editar arquivos truncados."
    - "Salvar arquivos sensíveis como .env, chaves privadas e .git."
    - "Migrar obrigatoriamente para Monaco nesta SPEC; se usado, deve ser decisão separada ou oportunista sem bloquear persistência."
    - "Persistir histórico/auditoria em banco se não houver padrão local já pronto."
```

# 5. Contrato De Dados

## 5.1 Shared Types

Arquivo alvo: `packages/shared/src/entities/ProjectFiles.ts`.

```ts
export const ProjectFileVersionSchema = z.object({
  hash: z.string().min(16),
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});

export const SaveProjectFileRequestSchema = z.object({
  path: z.string().min(1),
  runId: z.string().optional().nullable(),
  content: z.string(),
  baseVersion: ProjectFileVersionSchema,
  expectedEncoding: z.literal("utf-8").default("utf-8"),
});

export const SaveProjectFileResponseSchema = z.object({
  projectId: z.string(),
  runId: z.string().optional().nullable(),
  path: z.string(),
  content: z.string(),
  encoding: z.literal("utf-8"),
  truncated: z.literal(false),
  version: ProjectFileVersionSchema,
  savedAt: z.string().datetime(),
});

export const ProjectFileSaveErrorCodeSchema = z.enum([
  "project_not_found",
  "file_not_found",
  "forbidden_path",
  "sensitive_path",
  "not_regular_file",
  "binary_file",
  "file_too_large",
  "content_too_large",
  "truncated_file",
  "version_conflict",
  "permission_denied",
  "write_failed",
]);
```

## 5.2 Version Semantics

```yaml
version_source:
  hash: "sha256 over current raw file bytes, hex encoded"
  sizeBytes: "fs.stat(file).size"
  mtimeMs: "fs.stat(file).mtimeMs"

conflict_rule:
  before_write:
    - "Read current file bytes."
    - "Compute currentVersion."
    - "Compare currentVersion.hash with request.baseVersion.hash."
    - "If hash differs, reject with 409 version_conflict."
  mtime_handling:
    - "hash is authoritative."
    - "mtimeMs is returned for UI/debug and can be used as a cheap precheck, but must not be the only conflict guard."

client_baseline:
  after_get_file: "The response version becomes the editor baseline."
  after_save_success: "Returned version becomes the new baseline and dirty=false."
  after_conflict: "Keep local buffer unchanged and expose server version metadata if available."
```

# 6. HTTP API

```yaml
endpoint:
  method: "PUT"
  path: "/api/project-files/projects/:projectId/file"
  body: "SaveProjectFileRequest"
  success_status: 200
  success_response: "SaveProjectFileResponse"

status_codes:
  200: "Saved successfully."
  400: "Invalid request body or content too large."
  403: "Forbidden/sensitive path, symlink escape, git metadata, hidden file, or binary file."
  404: "Project or file not found."
  409: "Version conflict; disk changed after the frontend loaded the file."
  413: "Content exceeds max writable bytes."
  500: "Unexpected write failure."

error_response:
  shape:
    error: "string"
    code: "ProjectFileSaveErrorCode"
    path: "string | undefined"
    currentVersion: "ProjectFileVersion | undefined"
    currentContentPreview: "string | undefined"
  rule: "Never return sensitive file content in error responses."
```

Required API client method:

```ts
saveFile(projectId: string, input: SaveProjectFileRequest): Promise<SaveProjectFileResponse>
```

# 7. Backend Design

## 7.1 Service Method

Arquivo alvo: `apps/server/src/infrastructure/project/ProjectFileBrowserService.ts`.

```ts
saveFile(input: {
  projectId: string;
  runId?: string | null;
  path: string;
  content: string;
  baseVersion: ProjectFileVersion;
}): Promise<SaveProjectFileResponse>
```

## 7.2 Root Resolution

```yaml
root_resolution:
  source_of_truth:
    - "Resolve project by projectId using existing project construction/file browser repository."
    - "If runId is provided, it may narrow to the run workspace only if existing read behavior already allows that."
    - "Never accept absolute project root from frontend for write authority."
  invariant:
    - "The resolved root used for write must match the root that the read API uses for the same project/run."
  fallback:
    - "If run workspace is unavailable, use the persisted project root only if current read API already does the same."
```

## 7.3 Path Safety

```yaml
path_validation_order:
  - "Normalize separators to /."
  - "Reject empty path."
  - "Reject absolute paths."
  - "Reject any segment equal to . or ..."
  - "Reject .git and git metadata paths."
  - "Reject hidden path segments unless explicitly allowed by existing read policy; default deny."
  - "Reject sensitive basenames and suffixes: .env*, *.pem, *.key, *.p12, *.pfx, id_rsa, id_ed25519, known_hosts, authorized_keys."
  - "Resolve candidate = root / normalizedPath."
  - "Verify candidate is inside root after resolve."
  - "lstat candidate; reject symlink."
  - "stat candidate; require regular file."
```

## 7.4 File Type And Size Guards

```yaml
guards:
  max_read_bytes_for_edit: 512000
  max_write_bytes: 512000
  encoding: "utf-8"
  binary_detection:
    - "Reject if existing file contains NUL byte in initial sample."
    - "Reject if UTF-8 decode would produce excessive replacement chars."
  truncated_files:
    - "If GET returned truncated=true, frontend must not allow save."
    - "Backend must independently reject save if current file size exceeds max_read_bytes_for_edit."
  content_size:
    - "Compute Buffer.byteLength(content, 'utf8')."
    - "Reject if above max_write_bytes."
```

## 7.5 Atomic Write

```yaml
write_algorithm:
  - "Resolve and validate root/path."
  - "Read current file bytes."
  - "Compute currentVersion."
  - "Reject with 409 if currentVersion.hash != baseVersion.hash."
  - "Encode new content as UTF-8."
  - "Create temp path in same directory: .<filename>.horus-save-<pid>-<random>.tmp"
  - "Open temp file with flag wx."
  - "Write all bytes."
  - "fsync temp file when available."
  - "Rename temp file over target."
  - "Best-effort fsync parent directory when supported."
  - "Read target back, compute newVersion, return content and version."
  - "On failure before rename, remove temp file best-effort."

atomicity_reason:
  - "Renaming within the same directory keeps replacement atomic on the same filesystem."
  - "A partial process crash must not leave a half-written target file."
```

## 7.6 Observability

```yaml
logs:
  success:
    event: "project_file_save_succeeded"
    fields:
      - "projectId"
      - "runId"
      - "path"
      - "byteLength"
      - "oldHashPrefix"
      - "newHashPrefix"
  rejection:
    event: "project_file_save_rejected"
    fields:
      - "projectId"
      - "runId"
      - "path"
      - "code"
  secrets:
    - "Never log content."
    - "Never log full hash if current logging convention treats hashes as sensitive; hash prefix is enough."
```

# 8. Frontend Design

## 8.1 Editor State Machine

```yaml
states:
  pristine:
    meaning: "buffer equals baseline content"
    actions: ["edit"]
  dirty:
    meaning: "buffer differs from baseline"
    actions: ["save", "discard"]
  saving:
    meaning: "save mutation in progress"
    actions: ["continue editing disabled or guarded", "cancel not required"]
  saved:
    meaning: "last save succeeded recently"
    actions: ["edit"]
  error:
    meaning: "save failed for non-conflict reason"
    actions: ["retry save", "discard"]
  conflict:
    meaning: "backend returned version_conflict"
    actions: ["reload disk version", "keep local draft", "copy local draft optional"]
```

## 8.2 UX Requirements

```yaml
toolbar:
  required_controls:
    - "Save button disabled when pristine, saving, truncated, binary, or file missing."
    - "Discard button visible/enabled only when dirty/conflict/error with local draft."
    - "Status text: Unsaved changes, Saving, Saved, Conflict, Save failed."
  keyboard:
    - "Cmd/Ctrl+S triggers save when allowed and prevents browser save dialog."
    - "Escape must not discard changes."
  before_navigation:
    - "Switching files with dirty buffer prompts or blocks with explicit choice."
    - "Changing project with dirty buffer prompts or blocks with explicit choice."
    - "Browser beforeunload warns when dirty."
  conflict:
    - "Show concise message: 'This file changed on disk after you opened it.'"
    - "Do not overwrite automatically."
    - "Reload from disk resets buffer to server content and baseline to current version."
    - "Keep local draft preserves buffer and lets user manually copy/compare."
  refresh_after_save:
    - "Invalidate getFile query for active file."
    - "Invalidate getTree query for project because save may affect metadata/order in future."
    - "Update local cache optimistically only after backend success."
```

## 8.3 Component Contracts

```ts
type CodeViewerProps = {
  path: string;
  content: string;
  version: ProjectFileVersion;
  truncated: boolean;
  language?: string;
  onSave: (input: { path: string; content: string; baseVersion: ProjectFileVersion }) => Promise<SaveProjectFileResponse>;
  onDirtyChange?: (dirty: boolean) => void;
};
```

```yaml
component_rules:
  - "The editor buffer must reset only when path changes or a successful reload/save updates baseline."
  - "A background refetch must not replace a dirty buffer silently."
  - "Save failure must preserve typed content."
  - "The UI must not claim saved until backend returns success."
  - "Text sizes and typography must follow ID_VISUAL.md and existing project variables."
```

# 9. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC extends the existing file browser from safe read to safe write. It consumes project root resolution,
    filesystem access and shared schemas; it exposes a write endpoint consumed by the Arquivos screen.

  depends_on:
    - name: "Project file read layer"
      type: "backend_service"
      owner: "project-files backend"
      direction: "this_spec_consumes_dependency"
      contract_used: "projectId/runId root resolution, normalized path safety, file content response"
      required_for: "Write must target the same root and path semantics as read."
      failure_modes:
        - "Saving a file different from the one displayed."
        - "Writing outside project workspace."
      fallback_or_recovery: "Reject request and show backend error."
      verification:
        - "Read then save same file in temp workspace test."

    - name: "Shared ProjectFiles schemas"
      type: "internal_module"
      owner: "shared package"
      direction: "this_spec_consumes_dependency"
      contract_used: "SaveProjectFileRequest/Response and ProjectFileVersion"
      required_for: "Frontend/backend type agreement."
      failure_modes:
        - "Runtime shape mismatch."
      fallback_or_recovery: "Build/typecheck failure before release."
      verification:
        - "pnpm --filter @u-build/shared build"

  depended_on_by:
    - name: "ProjectFilesPage"
      type: "frontend_component"
      owner: "project-files frontend"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "saveFile mutation and cache invalidation behavior"
      compatibility_obligation: "Existing list/open/read flow must continue working."
      expected_consumer_behavior: "Send content with baseVersion and respect conflict/error responses."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web type-check"

    - name: "Future AST/indexing layer"
      type: "backend_service"
      owner: "code intelligence"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "File writes produce changed content on disk; no DB migration required now."
      compatibility_obligation: "Save should not bypass filesystem truth consumed by AST scanners."
      expected_consumer_behavior: "Re-scan or invalidate file intelligence in future specs."
      migration_or_notification_required: false
      verification:
        - "Document future invalidation hook; no AST implementation required here."
```

# 10. Sequenced Implementation Plan

```yaml
phase_1_shared_contract:
  steps:
    - "Add ProjectFileVersionSchema."
    - "Add SaveProjectFileRequestSchema."
    - "Add SaveProjectFileResponseSchema."
    - "Export inferred TypeScript types."
    - "Extend get file response to include version if it does not already."
  validation:
    - "pnpm --filter @u-build/shared build"

phase_2_backend_service:
  steps:
    - "Refactor existing read path helpers only if needed; preserve read behavior."
    - "Implement computeFileVersion(bytes, stat)."
    - "Implement validateWritableProjectFilePath."
    - "Implement saveFile atomic write flow."
    - "Return structured errors with stable code."
  validation:
    - "ProjectFileBrowserService tests for success, conflict, path escape, sensitive path, symlink, binary, too large, missing file."

phase_3_backend_route:
  steps:
    - "Add PUT /api/project-files/projects/:projectId/file."
    - "Parse body with shared schema."
    - "Map service errors to status codes."
    - "Ensure no content is logged in errors."
  validation:
    - "Route integration tests with temp project."

phase_4_frontend_api:
  steps:
    - "Add saveFile to projectFilesApi."
    - "Include version in read response typing."
    - "Add mutation in ProjectFilesPage."
    - "Invalidate tree and active file queries on success."
  validation:
    - "pnpm --filter @u-build/web type-check"

phase_5_frontend_editor_ux:
  steps:
    - "Update CodeViewer state machine."
    - "Add save/discard controls."
    - "Add Cmd/Ctrl+S."
    - "Guard file/project navigation with dirty draft."
    - "Render conflict/error states without clearing buffer."
    - "Disable save for truncated or non-editable files."
  validation:
    - "Manual smoke in browser: edit, save, reload, conflict."

phase_6_final_validation:
  steps:
    - "Run focused backend tests."
    - "Run shared build."
    - "Run web typecheck/build."
    - "Run one manual save smoke against local dev stack if server can start."
```

# 11. Test Matrix

```yaml
backend_unit_tests:
  success:
    - "Saves UTF-8 text file and returns new hash."
    - "File content on disk equals request content."
  conflict:
    - "Request with stale baseVersion returns 409."
    - "Conflict does not modify disk."
  path_safety:
    - "../outside.ts rejected."
    - "/absolute/path rejected."
    - ".git/config rejected."
    - ".env rejected."
    - "private.key rejected."
    - "symlink inside root pointing outside rejected."
  file_type:
    - "binary file rejected."
    - "directory rejected."
    - "missing file rejected."
  size:
    - "existing file over editable max rejected."
    - "new content over max write bytes rejected."

backend_route_tests:
  - "PUT valid body returns 200 and SaveProjectFileResponse."
  - "Invalid body returns 400."
  - "Conflict maps to 409 with code version_conflict."
  - "Sensitive path maps to 403."

frontend_validation:
  - "Typecheck verifies request/response types."
  - "Dirty state appears after editing."
  - "Save button disabled when pristine."
  - "Successful save resets dirty state."
  - "Conflict keeps local draft."
  - "Discard resets buffer to baseline."
```

# 12. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A textual file opened in Arquivos can be edited and saved to disk."
  - "Reloading the same file after save shows persisted content."
  - "A stale save is rejected with conflict instead of overwriting disk."
  - "Path traversal, hidden/sensitive files, .git, symlinks, directories and binaries cannot be saved."
  - "Truncated files cannot be saved from the UI or backend."
  - "Save errors preserve the user's local buffer."
  - "Tree and file queries refresh after successful save."
  - "The implementation does not require DB migration."
  - "The UI remains consistent with ID_VISUAL.md and existing project typography."
```

# 13. Agent Execution Rules

```yaml
execution_rules:
  - "Do not start by changing UI only; implement shared/backend contract first."
  - "Do not accept project root/path authority directly from frontend."
  - "Do not use mtime alone for conflict detection."
  - "Do not write with fs.writeFile directly to target without temp+rename."
  - "Do not allow save for files returned as truncated."
  - "Do not erase local editor state on failed mutation."
  - "Do not broaden scope into create/delete/rename/git commit."
  - "Before editing a file, check git status and avoid unrelated dirty changes."
  - "If another agent modified a target file during implementation, re-read before patching."
```

# 14. Minimum Final Report For Implementing Agent

```yaml
final_report_required_fields:
  changed_files:
    - "path"
  backend_contract:
    endpoint: "PUT /api/project-files/projects/:projectId/file"
    conflict_strategy: "sha256 baseVersion"
    atomic_write: "temp file + rename"
  validation:
    commands_run:
      - "command"
    manual_smoke:
      - "result or not run with reason"
  limitations:
    - "Any unimplemented out-of-scope item"
```

# 15. Implementation Log

```yaml
implementation_log:
  - date: "2026-05-26"
    status: "planned"
    notes:
      - "Spec rewritten after inspecting zup-sdd-agents and confirming that its code screen is read-only."
      - "Persistent writing must be implemented as a Horus-specific improvement, not copied from zup."
  - date: "2026-05-26"
    status: "implemented"
    notes:
      - "Added shared file version and save request/response contracts."
      - "Added backend PUT save route with SHA-256 conflict protection, path safety, binary/truncated/large-file rejection and atomic temp-file rename."
      - "Added frontend save API and CodeViewer dirty/saving/saved/error/conflict UX."
      - "Validated shared build, server build, web typecheck/build and focused backend route/service tests."
```
