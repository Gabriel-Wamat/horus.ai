import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type {
  ProjectFileContentResponse,
  ProjectFileVersion,
  SaveProjectFileResponse,
} from "@u-build/shared";
import { AlertTriangle, FileCode2, Lock } from "lucide-react";
import { ProjectFilesApiError } from "../../../api/projectFilesApi.js";
import { IdeStatusBar } from "./IdeStatusBar.js";
import { toMonacoLanguage } from "../utils/languageMapping.js";

interface CodeViewerProps {
  readonly file?: ProjectFileContentResponse | undefined;
  readonly path: string | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly saveError: Error | null;
  readonly isSaving: boolean;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onSave: (input: {
    path: string;
    content: string;
    baseVersion: ProjectFileVersion;
  }) => Promise<SaveProjectFileResponse>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function EmptyState(): JSX.Element {
  return (
    <div className="project-files-editor-empty">
      <FileCode2 size={34} aria-hidden="true" />
      <h2>Selecione um arquivo</h2>
      <p>Use a árvore à esquerda para abrir arquivos do projeto em abas.</p>
    </div>
  );
}

export function CodeViewer({
  file,
  path,
  isLoading,
  error,
  saveError,
  isSaving,
  onDirtyChange,
  onSave,
}: CodeViewerProps): JSX.Element {
  const [editableContent, setEditableContent] = useState("");
  const [baselineContent, setBaselineContent] = useState("");
  const [baselineVersion, setBaselineVersion] = useState<ProjectFileVersion | null>(null);
  const [saveState, setSaveState] = useState<"pristine" | "dirty" | "saved" | "error" | "conflict">("pristine");
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastDirtyRef = useRef<boolean | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const dirty = editableContent !== baselineContent;
  const canEdit = Boolean(file && !file.binary && !file.truncated && file.content != null && baselineVersion != null);
  const conflict = saveState === "conflict" || (saveError instanceof ProjectFilesApiError && saveError.code === "version_conflict");
  const monacoLanguage = toMonacoLanguage(file?.language, file?.path ?? path ?? "");
  const readonlyReason = file?.truncated
    ? "Arquivo truncado"
    : baselineVersion == null
      ? "Sem versão de leitura"
      : canEdit
        ? null
        : "Somente leitura";

  useEffect(() => {
    const nextContent = file?.content ?? "";
    setEditableContent(nextContent);
    setBaselineContent(nextContent);
    setBaselineVersion(file?.version ?? null);
    setSaveState("pristine");
    setCursor({ lineNumber: 1, column: 1 });
    lastDirtyRef.current = null;
  }, [file?.path, file?.content, file?.version?.hash]);

  useEffect(() => {
    if (!file) {
      if (lastDirtyRef.current !== false) {
        lastDirtyRef.current = false;
        onDirtyChange?.(false);
      }
      return;
    }
    if (lastDirtyRef.current !== dirty) {
      lastDirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
    if (dirty && (saveState === "pristine" || saveState === "saved")) {
      setSaveState("dirty");
    }
    if (!dirty && saveState === "dirty") {
      setSaveState("pristine");
    }
  }, [dirty, file, onDirtyChange, saveState]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const saveDisabled = !file || !canEdit || !dirty || isSaving || conflict || baselineVersion == null;

  const handleSave = useCallback(async (): Promise<void> => {
    if (!file || !baselineVersion || saveDisabled) return;
    try {
      setSaveState("dirty");
      const saved = await onSave({
        path: file.path,
        content: editableContent,
        baseVersion: baselineVersion,
      });
      setEditableContent(saved.content);
      setBaselineContent(saved.content);
      setBaselineVersion(saved.version);
      setSaveState("saved");
      onDirtyChange?.(false);
    } catch (err) {
      if (err instanceof ProjectFilesApiError && err.code === "version_conflict") {
        setSaveState("conflict");
        return;
      }
      setSaveState("error");
    }
  }, [baselineVersion, editableContent, file, onDirtyChange, onSave, saveDisabled]);

  useEffect(() => {
    saveRef.current = handleSave;
  }, [handleSave]);

  const defineHorusTheme = useCallback<BeforeMount>((monaco) => {
    monaco.editor.defineTheme("horus-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "dfe7e2", background: "080b0a" },
        { token: "comment", foreground: "6f7a80", fontStyle: "italic" },
        { token: "keyword", foreground: "5aa3f0" },
        { token: "string", foreground: "8be28b" },
        { token: "number", foreground: "f0b429" },
        { token: "type", foreground: "7dd3fc" },
      ],
      colors: {
        "editor.background": "#080b0a",
        "editor.foreground": "#dfe7e2",
        "editor.lineHighlightBackground": "#ffffff08",
        "editorCursor.foreground": "#f1f4f2",
        "editorGutter.background": "#080b0a",
        "editorLineNumber.foreground": "#465158",
        "editorLineNumber.activeForeground": "#a4adb3",
        "editor.selectionBackground": "#5aa3f044",
        "editor.inactiveSelectionBackground": "#5aa3f022",
      },
    });
  }, []);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveRef.current();
    });
    editor.onDidChangeCursorPosition((event) => {
      setCursor({
        lineNumber: event.position.lineNumber,
        column: event.position.column,
      });
    });
  }, []);

  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      detectIndentation: true,
      fontFamily: '"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      fontLigatures: false,
      fontSize: 14,
      lineHeight: 22,
      lineNumbers: "on",
      minimap: { enabled: false },
      padding: { top: 12, bottom: 20 },
      readOnly: !canEdit,
      renderLineHighlight: "line",
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      wordWrap: "off",
    }),
    [canEdit],
  );

  if (!path) return <EmptyState />;

  if (isLoading) {
    return (
      <div className="project-files-editor-empty">
        <span className="project-files-loading-dot" aria-hidden="true" />
        <h2>Carregando arquivo</h2>
        <p>{path}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-files-editor-empty is-error">
        <AlertTriangle size={34} aria-hidden="true" />
        <h2>Não foi possível ler o arquivo</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!file) return <EmptyState />;

  if (file.binary) {
    return (
      <div className="project-files-editor-empty">
        <Lock size={34} aria-hidden="true" />
        <h2>Arquivo binário</h2>
        <p>O conteúdo não é exibido para preservar a leitura segura do projeto.</p>
      </div>
    );
  }

  return (
    <article className="project-files-code-viewer">
      <header className="project-files-code-header">
        <div>
          <strong title={file.path}>{file.path}</strong>
          <span>
            {monacoLanguage} · {formatBytes(file.sizeBytes)}
          </span>
        </div>
        <div className="project-files-code-actions">
          {dirty ? <span className="project-files-save-status is-dirty">modificado</span> : null}
          {isSaving ? <span className="project-files-save-status is-dirty">salvando</span> : null}
          {file.truncated ? <span>truncado</span> : null}
        </div>
      </header>
      {file.truncated ? (
        <div className="project-files-save-warning" role="status">
          Arquivos truncados não podem ser salvos. Reabra com limite maior ou edite fora do Horus.
        </div>
      ) : null}
      {baselineVersion == null ? (
        <div className="project-files-save-warning" role="status">
          Este arquivo ainda não possui versão de leitura. Recarregue antes de salvar.
        </div>
      ) : null}
      {conflict ? (
        <div className="project-files-save-warning is-conflict" role="alert">
          Este arquivo mudou no disco depois que você abriu. Seu texto local foi preservado.
          Recarregue o arquivo para usar a versão do disco ou copie seu rascunho antes de descartar.
        </div>
      ) : null}
      {saveState === "error" && saveError ? (
        <div className="project-files-save-warning is-error" role="alert">
          {saveError.message}
        </div>
      ) : null}
      <div
        className="project-files-code-scroll"
        role="region"
        aria-label={`Conteúdo de ${file.path}`}
      >
        <div className="project-files-monaco-frame">
          <Editor
            beforeMount={defineHorusTheme}
            language={monacoLanguage}
            loading={<div className="project-files-monaco-loading">Preparando editor...</div>}
            onChange={(value) => setEditableContent(value ?? "")}
            onMount={handleEditorMount}
            options={editorOptions}
            path={file.path}
            theme="horus-dark"
            value={editableContent}
          />
        </div>
        <IdeStatusBar
          column={cursor.column}
          dirty={dirty}
          language={monacoLanguage}
          line={cursor.lineNumber}
          readonlyReason={readonlyReason}
          saveState={conflict ? "conflict" : isSaving ? "dirty" : saveState}
          sizeLabel={formatBytes(file.sizeBytes)}
        />
      </div>
    </article>
  );
}
