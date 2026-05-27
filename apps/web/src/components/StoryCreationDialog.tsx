import { useEffect, useRef, type RefObject, type JSX } from "react";
import type { UserStory, WorkspaceFolder } from "@u-build/shared";
import { UserStoryInputPage } from "./UserStoryInputPage.js";

export function StoryCreationDialog({
  isOpen,
  triggerRef,
  initialStories,
  workspaceFolders,
  selectedWorkspaceFolderId,
  isLoadingWorkspaceFolders,
  workspaceFolderError,
  onClose,
  onSubmit,
  onSelectWorkspaceFolder,
  onCreateWorkspaceFolder,
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  initialStories: UserStory[];
  workspaceFolders: WorkspaceFolder[];
  selectedWorkspaceFolderId: string;
  isLoadingWorkspaceFolders: boolean;
  workspaceFolderError: string | null;
  onClose: () => void;
  onSubmit: (
    stories: UserStory[],
    workspaceFolderId: string,
    options?: {
      autoApproveAndBuild?: boolean;
      workflowMode?: "standard" | "spec_generation";
    }
  ) => Promise<void>;
  onSelectWorkspaceFolder: (folderId: string) => void;
  onCreateWorkspaceFolder: (name: string) => Promise<void>;
}): JSX.Element | null {
  const modalRef = useRef<HTMLDivElement>(null);

  const close = (): void => {
    onClose();
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const getFocusable = (): HTMLElement[] =>
      Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("hidden") && element.offsetParent !== null
      );

    window.requestAnimationFrame(() => {
      const preferred = modal.querySelector<HTMLElement>("[data-autofocus='story-modal']");
      if (preferred && !preferred.hasAttribute("disabled")) {
        preferred.focus();
        return;
      }
      getFocusable()[0]?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && first && last && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && first && last && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        ref={modalRef}
        className="story-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-title"
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <p className="panel-kicker">Briefing</p>
            <h2 id="story-modal-title" className="panel-title">
              Criar user-stories
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar criação de user-stories"
            onClick={close}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <UserStoryInputPage
          onSubmit={onSubmit}
          initialStories={initialStories}
          workspaceFolders={workspaceFolders}
          selectedWorkspaceFolderId={selectedWorkspaceFolderId}
          isLoadingWorkspaceFolders={isLoadingWorkspaceFolders}
          workspaceFolderError={workspaceFolderError}
          onSelectWorkspaceFolder={onSelectWorkspaceFolder}
          onCreateWorkspaceFolder={onCreateWorkspaceFolder}
        />
      </div>
    </div>
  );
}
