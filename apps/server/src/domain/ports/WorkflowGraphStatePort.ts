export interface PendingRetryApproval {
  userStoryId: string;
  retryCount: number;
  score: number;
  notes: string;
  missingItems: string[];
}
