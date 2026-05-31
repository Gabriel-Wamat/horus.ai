import { randomUUID } from "node:crypto";
import type {
  RepositoryGraphImport,
  RepositoryGraphSnapshot,
  StructuralPatchIntent,
} from "@u-build/shared";

// Plans a coherent multi-file change set from a primary intent (e.g. "rename
// file A.tsx to B.tsx") by discovering dependent imports across the
// repository graph and producing the additional add_import / remove_import /
// rename_local intents needed to keep the project compiling after the change.
//
// The planner is deterministic and side-effect free: it returns a plan that
// the existing structural patch applier consumes. The plan is "atomic" in the
// sense that it includes a rollback note for every dependent change, so a
// failure mid-apply tells the caller exactly which steps to undo.

export type MultiFilePatchPrimaryIntent =
  | {
      readonly kind: "rename_file";
      readonly id?: string;
      readonly fromPath: string;
      readonly toPath: string;
      readonly rationale?: string;
    }
  | {
      readonly kind: "delete_file";
      readonly id?: string;
      readonly path: string;
      readonly rationale?: string;
    }
  | {
      readonly kind: "create_file";
      readonly id?: string;
      readonly path: string;
      readonly content: string;
      readonly rationale?: string;
    };

export interface MultiFilePatchPlannerInput {
  readonly primaryIntent: MultiFilePatchPrimaryIntent;
  // Optional. When absent, the planner emits only the primary intent and adds
  // a diagnostic noting that dependent-import discovery was skipped. This
  // keeps the planner usable in flows that have not yet built a graph (e.g.
  // a quick Front-agent path that only knows the file mutation).
  readonly graph?: RepositoryGraphSnapshot | undefined;
  // Files known to be readonly / protected — planner refuses to emit intents
  // touching these. Sourced from snapshot.editRestrictions.
  readonly protectedPaths?: readonly string[] | undefined;
}

export interface MultiFilePatchPlanStep {
  readonly intent: StructuralPatchIntent;
  // Step ordering hint for the applier. Lower values apply first.
  readonly order: number;
  // Path the rollback would target if this step succeeded but a later step
  // failed. Lets the applier compute reverse steps without re-discovering
  // dependencies.
  readonly rollbackTarget: string;
  // Optional human-readable label exposed to debug UI.
  readonly label: string;
}

export interface MultiFilePatchPlan {
  readonly id: string;
  readonly primaryIntent: MultiFilePatchPrimaryIntent;
  readonly steps: readonly MultiFilePatchPlanStep[];
  readonly affectedPaths: readonly string[];
  readonly diagnostics: readonly string[];
  readonly summary: {
    readonly stepCount: number;
    readonly dependentFileCount: number;
    readonly blockedByProtectedPaths: boolean;
  };
}

export class MultiFilePatchPlanner {
  plan(input: MultiFilePatchPlannerInput): MultiFilePatchPlan {
    const id = randomUUID();
    const protectedSet = new Set(input.protectedPaths ?? []);
    const diagnostics: string[] = [];
    const steps: MultiFilePatchPlanStep[] = [];
    const affected = new Set<string>();

    switch (input.primaryIntent.kind) {
      case "rename_file": {
        const dependents = input.graph
          ? findDependentImports(input.graph, input.primaryIntent.fromPath)
          : [];
        if (!input.graph) {
          diagnostics.push(
            "Skipping dependent-import discovery: no RepositoryGraphSnapshot provided to planner."
          );
        }
        affected.add(input.primaryIntent.fromPath);
        affected.add(input.primaryIntent.toPath);

        // Primary: explicit rename of the target file. The applier handles
        // file-level rename; we still emit the intent so the plan is the
        // single source of truth.
        steps.push({
          order: 0,
          rollbackTarget: input.primaryIntent.fromPath,
          label: `rename ${input.primaryIntent.fromPath} → ${input.primaryIntent.toPath}`,
          intent: {
            id: input.primaryIntent.id ?? `${id}-primary`,
            kind: "rename_local",
            targetPath: input.primaryIntent.fromPath,
            newName: input.primaryIntent.toPath,
            namedImports: [],
            ...(input.primaryIntent.rationale
              ? { rationale: input.primaryIntent.rationale }
              : {}),
          },
        });

        // For each dependent file, emit remove_import + add_import pair so the
        // applier updates the import source string in-place. We don't attempt
        // to rewrite the import path inside the existing add_import primitive
        // because it only takes a single string; the pair is the most explicit
        // way to express "swap the source".
        let dependentIndex = 0;
        for (const dependent of dependents) {
          if (protectedSet.has(dependent.sourcePath)) {
            diagnostics.push(
              `Skipping import update in protected file: ${dependent.sourcePath}`
            );
            continue;
          }
          affected.add(dependent.sourcePath);
          dependentIndex += 1;
          steps.push({
            order: dependentIndex,
            rollbackTarget: dependent.sourcePath,
            label: `remove old import in ${dependent.sourcePath}`,
            intent: {
              id: `${id}-dep-${dependentIndex}-remove`,
              kind: "remove_import",
              targetPath: dependent.sourcePath,
              importSource: dependent.source,
              namedImports: [],
              rationale: `Stale import after renaming ${input.primaryIntent.fromPath}.`,
            },
          });
          steps.push({
            order: dependentIndex + 0.5,
            rollbackTarget: dependent.sourcePath,
            label: `add new import in ${dependent.sourcePath}`,
            intent: {
              id: `${id}-dep-${dependentIndex}-add`,
              kind: "add_import",
              targetPath: dependent.sourcePath,
              importSource: rewriteImportSource(
                dependent.source,
                input.primaryIntent.fromPath,
                input.primaryIntent.toPath
              ),
              namedImports: [],
              rationale: `Replacement import after renaming ${input.primaryIntent.fromPath}.`,
            },
          });
        }

        if (dependents.length === 0) {
          diagnostics.push(
            `No dependent imports found for ${input.primaryIntent.fromPath} in the repository graph.`
          );
        }
        break;
      }
      case "delete_file": {
        const dependents = input.graph
          ? findDependentImports(input.graph, input.primaryIntent.path)
          : [];
        if (!input.graph) {
          diagnostics.push(
            "Skipping dependent-import discovery for delete: no graph provided."
          );
        }
        if (dependents.length > 0) {
          diagnostics.push(
            `Cannot delete ${input.primaryIntent.path}: ${dependents.length} file(s) still import from it. Resolve dependents first.`
          );
        }
        affected.add(input.primaryIntent.path);
        steps.push({
          order: 0,
          rollbackTarget: input.primaryIntent.path,
          label: `delete ${input.primaryIntent.path}`,
          intent: {
            id: input.primaryIntent.id ?? `${id}-primary`,
            kind: "delete",
            targetPath: input.primaryIntent.path,
            namedImports: [],
            ...(input.primaryIntent.rationale
              ? { rationale: input.primaryIntent.rationale }
              : {}),
          },
        });
        break;
      }
      case "create_file": {
        affected.add(input.primaryIntent.path);
        steps.push({
          order: 0,
          rollbackTarget: input.primaryIntent.path,
          label: `create ${input.primaryIntent.path}`,
          intent: {
            id: input.primaryIntent.id ?? `${id}-primary`,
            kind: "insert",
            targetPath: input.primaryIntent.path,
            position: "file_start",
            content: input.primaryIntent.content,
            namedImports: [],
            ...(input.primaryIntent.rationale
              ? { rationale: input.primaryIntent.rationale }
              : {}),
          },
        });
        break;
      }
    }

    const blockedByProtectedPaths = steps.some((step) =>
      protectedSet.has(step.intent.targetPath)
    );

    return {
      id,
      primaryIntent: input.primaryIntent,
      steps: steps.sort((a, b) => a.order - b.order),
      affectedPaths: [...affected].sort(),
      diagnostics,
      summary: {
        stepCount: steps.length,
        dependentFileCount: affected.size - 1,
        blockedByProtectedPaths,
      },
    };
  }
}

function findDependentImports(
  graph: RepositoryGraphSnapshot,
  targetPath: string
): RepositoryGraphImport[] {
  return graph.imports.filter(
    (imp) => imp.resolvedTargetPath === targetPath
  );
}

// Heuristic rewrite for import sources. Handles relative paths swapping the
// basename. Returns the original source string when the rewrite is ambiguous
// (e.g. the import uses a path alias), so the applier can ask for review.
function rewriteImportSource(
  source: string,
  fromPath: string,
  toPath: string
): string {
  const fromBase = stripExtension(basename(fromPath));
  const toBase = stripExtension(basename(toPath));
  if (!fromBase || !toBase) return source;
  if (source.includes(fromBase)) {
    return source.replace(fromBase, toBase);
  }
  return source;
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

export const defaultMultiFilePatchPlanner = new MultiFilePatchPlanner();
