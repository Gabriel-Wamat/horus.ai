import type { Spec, UserStory } from "@u-build/shared";
import { toPortableSlug } from "./portableSlug.js";

export const INDEX_FILE = "folders.json";
export const USER_STORY_FILE = "user-story.json";
export const ACTIVE_FILE = "active.json";
export const MANIFEST_FILE = "manifest.json";
export const REVISIONS_DIR = "revisions";
export const SPECS_DIR = "specs";

export interface StoryRevisionEntry {
  revision: number;
  file: string;
  createdAt: string;
}

export interface StoryManifest {
  folderId: string;
  storyId: string;
  createdAt: string;
  updatedAt: string;
  activeRevision: number;
  revisions: StoryRevisionEntry[];
}

export interface ActiveStoryFile {
  folderId: string;
  storyId: string;
  activeRevision: number;
  updatedAt: string;
  story: UserStory;
}

export interface StoryRevisionFile {
  folderId: string;
  storyId: string;
  revision: number;
  savedAt: string;
  story: UserStory;
}

export interface SpecRevisionEntry {
  revision: number;
  file: string;
  createdAt: string;
}

export interface SpecManifest {
  folderId: string;
  storyId: string;
  specId: string;
  createdAt: string;
  updatedAt: string;
  activeRevision: number;
  revisions: SpecRevisionEntry[];
}

export interface ActiveSpecFile {
  folderId: string;
  storyId: string;
  specId: string;
  activeRevision: number;
  updatedAt: string;
  spec: Spec;
}

export interface SpecRevisionFile {
  folderId: string;
  storyId: string;
  specId: string;
  revision: number;
  savedAt: string;
  spec: Spec;
}

export function slugify(value: string): string {
  return toPortableSlug(value, { fallback: "workspace" });
}

export function storyDirectoryName(story: UserStory): string {
  return `${slugify(story.title)}-${story.id.slice(0, 8)}`;
}

export function revisionFileName(revision: number): string {
  return `${revision.toString().padStart(4, "0")}-user-story.json`;
}

export function specRevisionFileName(revision: number): string {
  return `${revision.toString().padStart(4, "0")}-spec.json`;
}

export function sameStory(left: UserStory, right: UserStory): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameSpec(left: Spec, right: Spec): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
