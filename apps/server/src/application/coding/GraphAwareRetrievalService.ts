import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  RepositoryGraphConnectivitySchema,
  RepositoryGraphNeighborhoodSchema,
  type RepositoryFileEntry,
  type RepositoryGraphConnectivity,
  type RepositoryGraphEdge,
  type RepositoryGraphNeighborhood,
  type RepositoryGraphNeighborhoodNode,
  type RepositoryGraphNode,
  type RepositoryRetrievalCandidate,
  type StructuralPatchIntent,
} from "@u-build/shared";
import type {
  GraphAwareRetrievalInput,
  GraphAwareRetrievalPort,
  GraphAwareRetrievalResult,
} from "../ports/index.js";
import {
  dedupe,
  extractRepositorySearchTerms,
  scoreRepositoryPath,
  toRepositoryPath,
} from "./RepositoryAccessPolicy.js";

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_NODE_BUDGET = 40;
const DEFAULT_MAX_RELATED_FILES = 6;
const DEFAULT_MAX_BYTES_PER_FILE = 8_000;

export class GraphAwareRetrievalService implements GraphAwareRetrievalPort {
  async buildContext(
    input: GraphAwareRetrievalInput
  ): Promise<GraphAwareRetrievalResult> {
    throwIfAborted(input.signal);
    const maxDepth = clampPositive(input.maxDepth ?? DEFAULT_MAX_DEPTH, 0, 6);
    const nodeBudget = clampPositive(
      input.nodeBudget ?? DEFAULT_NODE_BUDGET,
      1,
      500
    );
    const maxRelatedFiles = clampPositive(
      input.maxRelatedFiles ?? DEFAULT_MAX_RELATED_FILES,
      0,
      100
    );
    const maxBytesPerFile = clampPositive(
      input.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE,
      1,
      2_000_000
    );
    const seedPaths = [
      ...input.retrieval.candidates.map((candidate) => candidate.path),
      ...(input.requestedPaths ?? []).map(toRepositoryPath),
    ]
      .filter(Boolean)
      .filter(dedupe);
    const neighborhood = this.neighborhood({
      graph: input.graph,
      seedPaths,
      maxDepth,
      nodeBudget,
    });
    const existingCandidatePaths = new Set(
      input.retrieval.candidates.map((candidate) => candidate.path)
    );
    const scanFilesByPath = new Map(input.scan.files.map((file) => [file.path, file]));
    const terms = extractRepositorySearchTerms(input.query);
    const relatedPaths = neighborhood.paths
      .filter((path) => !existingCandidatePaths.has(path))
      .filter((path) => scanFilesByPath.get(path)?.safety === "readable")
      .slice(0, maxRelatedFiles);
    const relatedCandidates: RepositoryRetrievalCandidate[] = [];
    for (const path of relatedPaths) {
      throwIfAborted(input.signal);
      const file = scanFilesByPath.get(path);
      if (!file) continue;
      const content = await readSafeContent(
        input.scan.projectRootPath,
        path,
        maxBytesPerFile
      );
      if (!content) continue;
      const bytes = Buffer.byteLength(content, "utf-8");
      relatedCandidates.push({
        path,
        language: file.language,
        bytes,
        content,
        startLine: 1,
        endLine: Math.max(1, content.split("\n").length),
        score: 10 + scoreRepositoryPath(path, terms) + pathGraphScore(path, neighborhood),
        matchedTerms: terms.filter((term) => path.toLowerCase().includes(term)),
        excerpts: [],
      });
    }

    return {
      neighborhood,
      relatedCandidates: relatedCandidates.sort(
        (left, right) => right.score - left.score || left.path.localeCompare(right.path)
      ),
      notes: buildGraphRetrievalNotes(neighborhood, relatedCandidates),
    };
  }

  assessIntentConnectivity(input: {
    readonly graph: GraphAwareRetrievalInput["graph"];
    readonly intents: readonly StructuralPatchIntent[];
  }): RepositoryGraphConnectivity[] {
    const filePaths = new Set(
      input.graph.nodes
        .filter((node) => node.kind === "file" && node.path)
        .map((node) => node.path as string)
    );
    const allGraphPaths = [...filePaths];
    return input.intents.map((intent) => {
      const targetPath = toRepositoryPath(intent.targetPath);
      if (filePaths.has(targetPath)) {
        const relatedPaths = directlyRelatedPaths(input.graph.edges, targetPath);
        return RepositoryGraphConnectivitySchema.parse({
          targetPath,
          status: "connected",
          reason: "Target exists in repository graph.",
          relatedPaths,
          confidence: relatedPaths.length > 0 ? 1 : 0.8,
        });
      }

      const relatedByConvention = allGraphPaths.filter(
        (path) => pathStem(path) === pathStem(targetPath)
      );
      if (relatedByConvention.length > 0) {
        return RepositoryGraphConnectivitySchema.parse({
          targetPath,
          status: "connected",
          reason:
            "Target does not exist yet, but filename convention links it to existing graph paths.",
          relatedPaths: relatedByConvention.slice(0, 8),
          confidence: 0.65,
        });
      }

      return RepositoryGraphConnectivitySchema.parse({
        targetPath,
        status: intent.targetPath.startsWith("@") ? "external" : "disconnected",
        reason:
          "Target path is not present in the repository graph and no related source/test path was found.",
        relatedPaths: [],
        confidence: 0.2,
      });
    });
  }

  private neighborhood(input: {
    readonly graph: GraphAwareRetrievalInput["graph"];
    readonly seedPaths: readonly string[];
    readonly maxDepth: number;
    readonly nodeBudget: number;
  }): RepositoryGraphNeighborhood {
    const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
    const fileNodeByPath = new Map(
      input.graph.nodes
        .filter((node) => node.kind === "file" && node.path)
        .map((node) => [node.path as string, node])
    );
    const adjacency = buildAdjacency(input.graph.edges);
    const seeds = input.seedPaths
      .map(toRepositoryPath)
      .map((path) => fileNodeByPath.get(path))
      .filter((node): node is RepositoryGraphNode => Boolean(node));
    const queue: Array<{
      node: RepositoryGraphNode;
      distance: number;
      viaEdgeIds: string[];
    }> = seeds.map((node) => ({ node, distance: 0, viaEdgeIds: [] }));
    const visited = new Map<string, RepositoryGraphNeighborhoodNode>();
    let truncated = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const existing = visited.get(current.node.id);
      if (existing && existing.distance <= current.distance) continue;
      if (visited.size >= input.nodeBudget) {
        truncated = true;
        break;
      }
      visited.set(current.node.id, {
        node: current.node,
        distance: current.distance,
        score: scoreNode(current.distance, current.node),
        viaEdgeIds: current.viaEdgeIds,
      });
      if (current.distance >= input.maxDepth) continue;
      const adjacent = (adjacency.get(current.node.id) ?? [])
        .filter((edge) => !(current.node.kind === "package_scope" && edge.kind === "in_package"))
        .sort(compareAdjacentEdges);
      for (const edge of adjacent) {
        const nextId = edge.sourceId === current.node.id ? edge.targetId : edge.sourceId;
        const nextNode = nodeById.get(nextId);
        if (!nextNode) continue;
        queue.push({
          node: nextNode,
          distance: current.distance + 1,
          viaEdgeIds: [...current.viaEdgeIds, edge.id],
        });
      }
    }

    const nodes = [...visited.values()].sort(
      (left, right) =>
        left.distance - right.distance ||
        right.score - left.score ||
        left.node.id.localeCompare(right.node.id)
    );
    const visitedIds = new Set(nodes.map((item) => item.node.id));
    const edges = input.graph.edges
      .filter((edge) => visitedIds.has(edge.sourceId) && visitedIds.has(edge.targetId))
      .sort(compareEdges);
    const paths = nodes
      .map((item) => item.node.path)
      .filter((path): path is string => Boolean(path))
      .filter(dedupe)
      .sort((left, right) => {
        const leftDistance = nodes.find((item) => item.node.path === left)?.distance ?? 99;
        const rightDistance = nodes.find((item) => item.node.path === right)?.distance ?? 99;
        return leftDistance - rightDistance || left.localeCompare(right);
      });

    return RepositoryGraphNeighborhoodSchema.parse({
      seedPaths: input.seedPaths.map(toRepositoryPath).filter(Boolean).filter(dedupe),
      maxDepth: input.maxDepth,
      nodeBudget: input.nodeBudget,
      nodes,
      edges,
      paths,
      summary: {
        seedCount: seeds.length,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        pathCount: paths.length,
        truncated,
      },
      notes:
        seeds.length === 0
          ? ["No graph seed paths were present in the graph."]
          : truncated
            ? ["Graph neighborhood truncated by node budget."]
            : [],
    });
  }
}

function buildAdjacency(
  edges: readonly RepositoryGraphEdge[]
): Map<string, RepositoryGraphEdge[]> {
  const adjacency = new Map<string, RepositoryGraphEdge[]>();
  for (const edge of edges) {
    adjacency.set(edge.sourceId, [...(adjacency.get(edge.sourceId) ?? []), edge]);
    adjacency.set(edge.targetId, [...(adjacency.get(edge.targetId) ?? []), edge]);
  }
  return adjacency;
}

function compareAdjacentEdges(
  left: RepositoryGraphEdge,
  right: RepositoryGraphEdge
): number {
  return (
    edgeKindPriority(left.kind) - edgeKindPriority(right.kind) ||
    right.confidence - left.confidence ||
    left.id.localeCompare(right.id)
  );
}

function compareEdges(left: RepositoryGraphEdge, right: RepositoryGraphEdge): number {
  return (
    left.kind.localeCompare(right.kind) ||
    (left.sourcePath ?? left.sourceId).localeCompare(right.sourcePath ?? right.sourceId) ||
    (left.targetPath ?? left.targetId).localeCompare(right.targetPath ?? right.targetId) ||
    left.id.localeCompare(right.id)
  );
}

function edgeKindPriority(kind: RepositoryGraphEdge["kind"]): number {
  switch (kind) {
    case "imports":
    case "related_test":
    case "tests":
      return 0;
    case "references":
      return 1;
    case "declares":
    case "exports":
      return 2;
    case "in_package":
      return 3;
    case "imports_external":
      return 4;
  }
}

function scoreNode(distance: number, node: RepositoryGraphNode): number {
  const base = Math.max(1, 100 - distance * 20);
  if (node.kind === "file") return base + 10;
  if (node.kind === "symbol") return base + 5;
  return base;
}

function pathGraphScore(
  path: string,
  neighborhood: RepositoryGraphNeighborhood
): number {
  const node = neighborhood.nodes.find((item) => item.node.path === path);
  return node ? Math.max(1, 50 - node.distance * 10) : 1;
}

async function readSafeContent(
  projectRootPath: string,
  relativePath: string,
  maxBytes: number
): Promise<string> {
  const absolutePath = resolve(projectRootPath, relativePath);
  const relation = relative(projectRootPath, absolutePath);
  if (relation.startsWith("..") || relation.includes(`..${sep}`)) return "";
  const raw = await fs.readFile(absolutePath, "utf-8").catch(() => "");
  return raw.slice(0, maxBytes);
}

function buildGraphRetrievalNotes(
  neighborhood: RepositoryGraphNeighborhood,
  relatedCandidates: readonly RepositoryRetrievalCandidate[]
): string[] {
  const notes = [...neighborhood.notes];
  if (relatedCandidates.length > 0) {
    notes.push(
      `Graph-aware retrieval added ${relatedCandidates.length} related file(s).`
    );
  }
  if (neighborhood.summary.truncated) {
    notes.push("Graph-aware retrieval was truncated by graph budget.");
  }
  return notes.filter(dedupe);
}

function directlyRelatedPaths(
  edges: readonly RepositoryGraphEdge[],
  targetPath: string
): string[] {
  return edges
    .filter((edge) => edge.sourcePath === targetPath || edge.targetPath === targetPath)
    .map((edge) => (edge.sourcePath === targetPath ? edge.targetPath : edge.sourcePath))
    .filter((path): path is string => Boolean(path))
    .filter((path) => path !== targetPath)
    .filter(dedupe)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
}

function pathStem(path: string): string {
  return path
    .split("/")
    .at(-1)!
    .replace(/\.[^.]+$/u, "")
    .replace(/\.(test|spec)$/iu, "")
    .toLowerCase();
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Graph-aware retrieval cancelled.");
  error.name = "AbortError";
  throw error;
}
