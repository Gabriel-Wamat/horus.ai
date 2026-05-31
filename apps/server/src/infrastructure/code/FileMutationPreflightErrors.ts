export type FileMutationFailureReason =
  | "absolute_path"
  | "path_escape"
  | "path_forbidden"
  | "symlink_path"
  | "missing_file"
  | "already_exists"
  | "version_conflict"
  | "delete_denied"
  | "binary_file"
  | "content_too_large"
  | "invalid_operation"
  | "apply_failed";

export class FileMutationPreflightError extends Error {
  constructor(
    readonly reason: FileMutationFailureReason,
    readonly targetPath: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "FileMutationPreflightError";
  }
}
