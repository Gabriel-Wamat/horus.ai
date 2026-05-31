import type { CodingTaskSurface } from "@u-build/shared";

export interface CodingTaskRouteInput {
  readonly prompt: string;
  readonly selectedPaths?: readonly string[];
  readonly projectRootPath?: string;
}

export interface CodingTaskRoute {
  readonly surface: CodingTaskSurface;
  readonly reason: string;
}

const FRONTEND_PATH_PATTERN =
  /(^|\/)(apps\/web|web|frontend|client|src\/components|src\/app|src\/pages|src\/styles|src\/features\/.*\/components)(\/|$)|\.(tsx|jsx|css|scss)$/i;
const BACKEND_PATH_PATTERN =
  /(^|\/)(apps\/server|server|backend|api|routes|controllers|services|repositories|database|migrations)(\/|$)|\.(sql)$/i;
const CONFIG_PATH_PATTERN =
  /(^|\/)(package\.json|pnpm-workspace\.yaml|turbo\.json|tsconfig(?:\..*)?\.json|vite\.config\.ts|Dockerfile|docker-compose\.ya?ml)$/i;

const FRONTEND_TERMS = [
  "frontend",
  "front-end",
  "react",
  "component",
  "layout",
  "css",
  "ui",
  "tela",
  "botao",
  "button",
  "preview",
];

const BACKEND_TERMS = [
  "backend",
  "back-end",
  "api",
  "server",
  "route",
  "database",
  "postgres",
  "repository",
  "endpoint",
  "auth",
];

const CONFIG_TERMS = [
  "config",
  "docker",
  "package",
  "build",
  "turbo",
  "typescript",
  "tsconfig",
  "vite",
];

export class CodingTaskRouter {
  route(input: CodingTaskRouteInput): CodingTaskRoute {
    const paths = input.selectedPaths ?? [];
    const pathText = paths.join("\n");
    const prompt = normalize(input.prompt);
    const pathFrontend = paths.some((path) => FRONTEND_PATH_PATTERN.test(path));
    const pathBackend = paths.some((path) => BACKEND_PATH_PATTERN.test(path));
    const pathConfig = paths.some((path) => CONFIG_PATH_PATTERN.test(path));
    const promptFrontend = FRONTEND_TERMS.some((term) => prompt.includes(term));
    const promptBackend = BACKEND_TERMS.some((term) => prompt.includes(term));
    const promptConfig = CONFIG_TERMS.some((term) => prompt.includes(term));

    if ((pathFrontend || promptFrontend) && (pathBackend || promptBackend)) {
      return {
        surface: "full_stack",
        reason: "Detected both frontend and backend evidence in prompt or selected paths.",
      };
    }
    if (pathFrontend || promptFrontend) {
      return {
        surface: "frontend",
        reason: "Detected frontend evidence in prompt or selected paths.",
      };
    }
    if (pathBackend || promptBackend) {
      return {
        surface: "backend",
        reason: "Detected backend evidence in prompt or selected paths.",
      };
    }
    if (pathConfig || promptConfig || CONFIG_PATH_PATTERN.test(pathText)) {
      return {
        surface: "config",
        reason: "Detected configuration/build evidence in prompt or selected paths.",
      };
    }
    if (input.projectRootPath) {
      return {
        surface: "unknown",
        reason: "Project root is known, but no deterministic surface evidence was found.",
      };
    }
    return {
      surface: "unknown",
      reason: "No deterministic project surface evidence was found.",
    };
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
