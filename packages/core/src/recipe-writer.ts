import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuidedSession } from "@guidedpatch/schema";

import { renderSessionMarkdown } from "./markdown-writer";
import { createInitialSessionState, ensureGuidedDirectories, writeGuidedState } from "./state";

export async function writeRecipeFiles(rootDir: string, session: GuidedSession) {
  const paths = await ensureGuidedDirectories(rootDir);
  const recipePayload = `${JSON.stringify(session, null, 2)}\n`;
  const markdownPayload = renderSessionMarkdown(session);
  const sessionRecipePath = path.join(paths.sessionsDir, `${session.id}.recipe.json`);
  const sessionMarkdownPath = path.join(paths.sessionsDir, `${session.id}.recipe.md`);

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
