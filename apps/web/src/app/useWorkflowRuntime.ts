import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  LlmProviderCapability,
  LlmSettingsDraft,
  LlmSettingsProfile,
  Spec,
  UserStory,
  WorkflowState,
} from "@u-build/shared";
import { workflowApi } from "../api/workflowApi.js";
import { useEventStream } from "../hooks/useEventStream.js";
import type { RetryApprovalPayload } from "../components/RetryApproval.js";
import type { CuratorReviewPayload } from "../components/CuratorReviewCheckpoint.js";

const SESSION_THREAD_KEY = "horus_thread_id";
const SESSION_CURATOR_REVIEW_KEY = "horus_curator_review";

function readPersistedThreadId(): string | null {
  try { return localStorage.getItem(SESSION_THREAD_KEY); } catch { return null; }
}

function writePersistedThreadId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SESSION_THREAD_KEY, id);
    else localStorage.removeItem(SESSION_THREAD_KEY);
  } catch { /* ignore */ }
}

function readPersistedCuratorReview(threadId: string): CuratorReviewPayload | null {
  try {
    const raw = localStorage.getItem(SESSION_CURATOR_REVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { threadId: string; payload: CuratorReviewPayload };
    return parsed.threadId === threadId ? parsed.payload : null;
  } catch { return null; }
}

function writePersistedCuratorReview(threadId: string | null, payload: CuratorReviewPayload | null): void {
  try {
    if (threadId && payload) {
      localStorage.setItem(SESSION_CURATOR_REVIEW_KEY, JSON.stringify({ threadId, payload }));
    } else {
      localStorage.removeItem(SESSION_CURATOR_REVIEW_KEY);
    }
  } catch { /* ignore */ }
}

export function useWorkflowRuntime({
  selectedWorkspaceFolderId,
  selectedStoryId,
  persistedSpecsByStoryId,
  setPersistedStories,
  setPersistedSpecsByStoryId,
  setLastSubmittedStories,
  setSelectedStoryId,
  setStorySpecTab,
  setWorkspaceFolderArtifactsById,
  setWorkspaceFolderError,
  loadWorkspaceFolders,
  closeStoryModal,
}: {
  selectedWorkspaceFolderId: string;
  selectedStoryId: string | null;
  persistedSpecsByStoryId: Record<string, Spec>;
  setPersistedStories: Dispatch<SetStateAction<UserStory[]>>;
  setPersistedSpecsByStoryId: Dispatch<SetStateAction<Record<string, Spec>>>;
  setLastSubmittedStories: Dispatch<SetStateAction<UserStory[]>>;
  setSelectedStoryId: (storyId: string | null) => void;
  setStorySpecTab: (tab: "story" | "spec") => void;
  setWorkspaceFolderArtifactsById: Dispatch<
    SetStateAction<Record<string, { userStories: UserStory[]; specsByStoryId: Record<string, Spec> }>>
  >;
  setWorkspaceFolderError: (error: string | null) => void;
  loadWorkspaceFolders: () => Promise<void>;
  closeStoryModal: () => void;
}): {
  threadId: string | null;
  setThreadId: (threadId: string | null) => void;
  workflowState: WorkflowState | null;
  setWorkflowState: Dispatch<SetStateAction<WorkflowState | null>>;
  llmProviders: LlmProviderCapability[];
  llmProfile: LlmSettingsProfile | null;
  isLoadingLlmProfile: boolean;
  saveLlmSettings: (
    settings: LlmSettingsDraft & {
      validationStatus?: "untested" | "valid" | "invalid";
      validationMessage?: string;
      validatedAt?: string;
    }
  ) => Promise<LlmSettingsProfile>;
  testLlmSettings: (
    settings: LlmSettingsDraft
  ) => Promise<{ ok: boolean; message: string; testedAt: string }>;
  deleteLlmSettings: () => Promise<void>;
  pendingSpec: { userStoryId: string; spec: Spec } | null;
  setPendingSpec: Dispatch<SetStateAction<{ userStoryId: string; spec: Spec } | null>>;
  pendingRetry: RetryApprovalPayload | null;
  isRetrySubmitting: boolean;
  pendingCuratorReview: CuratorReviewPayload | null;
  isCuratorReviewSubmitting: boolean;
  isStartingWorkflow: boolean;
  events: ReturnType<typeof useEventStream>["events"];
  isConnected: boolean;
  handleStart: (
    stories: UserStory[],
    workspaceFolderId: string,
    options?: {
      autoApproveAndBuild?: boolean;
      workflowMode?: "standard" | "spec_generation";
    }
  ) => Promise<void>;
  handleSpecApproval: (approved: boolean, editedSpec?: Spec) => Promise<void>;
  handleRetryDecision: (continueRetry: boolean) => Promise<void>;
  handleCuratorReviewDecision: (accepted: boolean) => Promise<void>;
  resetWorkflow: () => void;
} {
  const [threadId, setThreadIdState] = useState<string | null>(readPersistedThreadId);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);

  const setThreadId = useCallback((id: string | null): void => {
    setThreadIdState(id);
    writePersistedThreadId(id);
  }, []);

  // Restore workflow state on mount when threadId came from localStorage
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !threadId) return;
    restoredRef.current = true;
    void workflowApi.getStatus(threadId)
      .then(setWorkflowState)
      .catch(() => setThreadId(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When localStorage has no threadId (e.g. incognito), restore the latest thread
  // for the selected folder from the backend so the preview persists across tabs.
  const hadLocalThreadIdRef = useRef(Boolean(readPersistedThreadId()));
  const restoredFromFolderRef = useRef(false);
  useEffect(() => {
    if (
      restoredFromFolderRef.current ||
      hadLocalThreadIdRef.current ||
      threadId ||
      !selectedWorkspaceFolderId
    ) return;
    restoredFromFolderRef.current = true;
    void workflowApi.getLatestThreadForFolder(selectedWorkspaceFolderId)
      .then((latestThreadId) => {
        if (!latestThreadId) return;
        setThreadId(latestThreadId);
        void workflowApi.getStatus(latestThreadId).then(setWorkflowState).catch(() => {});
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceFolderId, threadId, setThreadId]);

  const [llmProviders, setLlmProviders] = useState<LlmProviderCapability[]>([]);
  const [llmProfile, setLlmProfile] = useState<LlmSettingsProfile | null>(null);
  const [isLoadingLlmProfile, setIsLoadingLlmProfile] = useState(false);
  const [pendingSpec, setPendingSpec] = useState<{ userStoryId: string; spec: Spec } | null>(null);
  const [pendingRetry, setPendingRetry] = useState<RetryApprovalPayload | null>(null);
  const [isRetrySubmitting, setIsRetrySubmitting] = useState(false);
  const [pendingCuratorReview, setPendingCuratorReview] = useState<CuratorReviewPayload | null>(
    () => {
      const tid = readPersistedThreadId();
      return tid ? readPersistedCuratorReview(tid) : null;
    }
  );
  const [isCuratorReviewSubmitting, setIsCuratorReviewSubmitting] = useState(false);

  useEffect(() => {
    writePersistedCuratorReview(threadId, pendingCuratorReview);
  }, [threadId, pendingCuratorReview]);
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);
  const { events, isConnected } = useEventStream(threadId);
  const autoApproveBuildRef = useRef(false);
  const autoApprovedSpecIdsRef = useRef(new Set<string>());
  const processedCountRef = useRef(0);

  useEffect(() => {
    setIsLoadingLlmProfile(true);
    void Promise.all([
      workflowApi
        .listLlmProviders()
        .then((result) => setLlmProviders(result.providers))
        .catch(() => setLlmProviders([])),
      workflowApi
        .getLlmSettings()
        .then(setLlmProfile)
        .catch(() => setLlmProfile(null)),
    ]).finally(() => setIsLoadingLlmProfile(false));
  }, []);

  useEffect(() => {
    if (!threadId) return;

    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;

    for (const event of newEvents) {
      switch (event.type) {
        case "awaiting_approval":
          setPendingSpec({ userStoryId: event.userStoryId, spec: event.spec });
          break;
        case "awaiting_retry_approval":
          setPendingRetry({
            userStoryId: event.userStoryId,
            retryCount: event.retryCount,
            score: event.score,
            notes: event.notes,
            missingItems: event.missingItems,
          });
          break;
        case "awaiting_curator_review":
          void workflowApi.getStatus(threadId).then(setWorkflowState);
          setPendingCuratorReview({
            userStoryId: event.userStoryId,
            score: event.score,
            notes: event.notes,
            previewSessionId: event.previewSessionId,
          });
          break;
        case "status_changed":
          if (
            event.status === "completed" ||
            event.status === "cancelled" ||
            event.status === "error"
          ) {
            void workflowApi.getStatus(threadId).then(setWorkflowState);
          }
          if (event.status === "running") {
            setPendingRetry(null);
            setPendingCuratorReview(null);
          }
          break;
      }
    }
  }, [events, threadId]);

  useEffect(() => {
    if (!pendingSpec) return;
    setSelectedStoryId(pendingSpec.userStoryId);
    setStorySpecTab("spec");
  }, [pendingSpec, setSelectedStoryId, setStorySpecTab]);

  useEffect(() => {
    if (!threadId || !pendingSpec || !autoApproveBuildRef.current) return;

    const approvalKey = `${threadId}:${pendingSpec.userStoryId}:${pendingSpec.spec.id}:${pendingSpec.spec.version}`;
    if (autoApprovedSpecIdsRef.current.has(approvalKey)) return;
    autoApprovedSpecIdsRef.current.add(approvalKey);

    void workflowApi
      .resume(threadId, pendingSpec.userStoryId, {
        approved: true,
        editedSpec: { ...pendingSpec.spec, approvedBy: "auto" },
        reviewedAt: new Date().toISOString(),
        reviewedBy: "horus-auto-build",
      })
      .then(() => {
        setPendingSpec(null);
        setStorySpecTab("spec");
      })
      .catch((error) => {
        setWorkspaceFolderError(
          error instanceof Error
            ? error.message
            : "Falha ao autorizar a construção automaticamente."
        );
      });
  }, [pendingSpec, setStorySpecTab, setWorkspaceFolderError, threadId]);

  const handleStart = async (
    stories: UserStory[],
    workspaceFolderId: string,
    options: {
      autoApproveAndBuild?: boolean;
      workflowMode?: "standard" | "spec_generation";
    } = {}
  ): Promise<void> => {
    setIsStartingWorkflow(true);
    autoApproveBuildRef.current = Boolean(options.autoApproveAndBuild);
    autoApprovedSpecIdsRef.current = new Set();
    setLastSubmittedStories(stories);
    setWorkflowState(null);
    setPendingSpec(null);
    setPendingRetry(null);
    setPendingCuratorReview(null);
    processedCountRef.current = 0;
    setSelectedStoryId(stories[0]?.id ?? null);
    setStorySpecTab("spec");
    try {
      const { threadId: id } = await workflowApi.start(
        stories,
        workspaceFolderId,
        options.workflowMode ?? "standard"
      );
      setPersistedStories(stories);
      setWorkspaceFolderArtifactsById((current) => ({
        ...current,
        [workspaceFolderId]: {
          userStories: stories,
          specsByStoryId: current[workspaceFolderId]?.specsByStoryId ?? {},
        },
      }));
      void loadWorkspaceFolders();
      setThreadId(id);
      closeStoryModal();
    } finally {
      setIsStartingWorkflow(false);
    }
  };

  const handleSpecApproval = async (
    approved: boolean,
    editedSpec?: Spec
  ): Promise<void> => {
    if (!threadId || !pendingSpec) return;

    if (!approved) {
      await workflowApi.resume(threadId, pendingSpec.userStoryId, {
        approved: false,
        reviewedAt: new Date().toISOString(),
      });
      setPendingSpec(null);
      return;
    }

    await workflowApi.resume(threadId, pendingSpec.userStoryId, {
      approved: true,
      editedSpec,
      reviewedAt: new Date().toISOString(),
    });

    setPendingSpec(null);
  };

  const handleCuratorReviewDecision = async (accepted: boolean): Promise<void> => {
    if (!threadId || !pendingCuratorReview) return;

    setIsCuratorReviewSubmitting(true);
    try {
      await workflowApi.curatorReviewDecision(
        threadId,
        pendingCuratorReview.userStoryId,
        accepted
      );
      if (!accepted) {
        const state = await workflowApi.getStatus(threadId);
        setWorkflowState(state);
      }
      setPendingCuratorReview(null);
    } finally {
      setIsCuratorReviewSubmitting(false);
    }
  };

  const handleRetryDecision = async (continueRetry: boolean): Promise<void> => {
    if (!threadId || !pendingRetry) return;

    setIsRetrySubmitting(true);
    try {
      await workflowApi.retryDecision(threadId, pendingRetry.userStoryId, continueRetry);
      if (!continueRetry) {
        const state = await workflowApi.getStatus(threadId);
        setWorkflowState(state);
      }
      setPendingRetry(null);
    } finally {
      setIsRetrySubmitting(false);
    }
  };

  const resetWorkflow = (): void => {
    setThreadId(null);
    setPendingSpec(null);
    setPendingCuratorReview(null);
    setWorkflowState(null);
    setStorySpecTab("story");
  };

  const saveLlmSettings = async (
    settings: LlmSettingsDraft & {
      validationStatus?: "untested" | "valid" | "invalid";
      validationMessage?: string;
      validatedAt?: string;
    }
  ): Promise<LlmSettingsProfile> => {
    const profile = await workflowApi.saveLlmSettings(settings);
    setLlmProfile(profile);
    return profile;
  };

  const testLlmSettings = (
    settings: LlmSettingsDraft
  ): Promise<{ ok: boolean; message: string; testedAt: string }> =>
    workflowApi.testLlmSettings(settings);

  const deleteLlmSettings = async (): Promise<void> => {
    if (!llmProfile) return;
    await workflowApi.deleteLlmSettings(llmProfile.id);
    setLlmProfile(null);
  };

  return {
    threadId,
    setThreadId,
    workflowState,
    setWorkflowState,
    llmProviders,
    llmProfile,
    isLoadingLlmProfile,
    saveLlmSettings,
    testLlmSettings,
    deleteLlmSettings,
    pendingSpec,
    setPendingSpec,
    pendingRetry,
    isRetrySubmitting,
    pendingCuratorReview,
    isCuratorReviewSubmitting,
    isStartingWorkflow,
    events,
    isConnected,
    handleStart,
    handleSpecApproval,
    handleRetryDecision,
    handleCuratorReviewDecision,
    resetWorkflow,
  };
}
