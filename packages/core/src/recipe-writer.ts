import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuidedSession } from "@duckwalk/schema";

import { renderSessionMarkdown } from "./markdown-writer";
import { createInitialSessionState, ensureGuidedDirectories, writeGuidedState } from "./state";

const guidedImplementationIgnoreRule = ".guided-implementation/";

async function ensureGuidedImplementationGitignore(rootDir: string) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  let existing = "";

  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    existing = "";
  }

  const hasRule = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some(
      (line) =>
        line === guidedImplementationIgnoreRule ||
        line === ".guided-implementation" ||
        line === ".guided-implementation/*"
    );

  if (hasRule) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, `${existing}${prefix}${guidedImplementationIgnoreRule}\n`);
}

export async function writeRecipeFiles(rootDir: string, session: GuidedSession) {
  const paths = await ensureGuidedDirectories(rootDir);
  const recipePayload = `${JSON.stringify(session, null, 2)}\n`;
  const markdownPayload = renderSessionMarkdown(session);
  const sessionRecipePath = path.join(paths.sessionsDir, `${session.id}.recipe.json`);
  const sessionMarkdownPath = path.join(paths.sessionsDir, `${session.id}.recipe.md`);

  await ensureGuidedImplementationGitignore(rootDir);
  await writeFile(paths.currentRecipePath, recipePayload);
  await writeFile(paths.currentMarkdownPath, markdownPayload);
  await writeFile(sessionRecipePath, recipePayload);
  await writeFile(sessionMarkdownPath, markdownPayload);
  await writeGuidedState(rootDir, createInitialSessionState(session));

  return {
    recipePath: paths.currentRecipePath,
    markdownPath: paths.currentMarkdownPath,
    statePath: paths.statePath,
    sessionRecipePath,
    sessionMarkdownPath
  };
}

export async function readGuidedSession(rootDir: string, sessionId?: string): Promise<GuidedSession> {
  const paths = await ensureGuidedDirectories(rootDir);
  const recipePath = sessionId
    ? path.join(paths.sessionsDir, `${sessionId}.recipe.json`)
    : paths.currentRecipePath;
  const raw = await readFile(recipePath, "utf8");
  return JSON.parse(raw) as GuidedSession;
}
