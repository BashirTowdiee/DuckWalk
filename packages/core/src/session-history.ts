import { readdir, writeFile } from "node:fs/promises";

import {
  guidedSessionSchema,
  type GuidedSession,
  type SessionMode
} from "@duckwalk/schema";

import { renderSessionMarkdown } from "./markdown-writer";
import { readGuidedSession } from "./recipe-writer";
import {
  createInitialSessionState,
  ensureGuidedDirectories,
  readGuidedState,
  resolveGuidedPaths,
  writeGuidedState,
  type GuidedSessionState
} from "./state";

export type GuidedSessionHistoryStatus = "pending" | "complete";

export type GuidedSessionHistoryEntry = {
  id: string;
  mode: SessionMode;
  title: string;
  summary: string;
  createdAt: string;
  question?: string | undefined;
  stepCount: number;
  completedStepCount: number;
  status: GuidedSessionHistoryStatus;
  isCurrent: boolean;
};

async function readCurrentSession(rootDir: string): Promise<GuidedSession | null> {
  try {
    return guidedSessionSchema.parse(await readGuidedSession(rootDir));
  } catch {
    return null;
  }
}

async function readSessionStateForHistory(
  rootDir: string,
  session: GuidedSession,
  currentSessionId: string | null
): Promise<GuidedSessionState> {
  const archivedState = await readGuidedState(rootDir, session.id);
  if (archivedState) {
    return archivedState;
  }

  if (currentSessionId === session.id) {
    const currentState = await readGuidedState(rootDir);
    if (currentState) {
      return currentState;
    }
  }

  return createInitialSessionState(session);
}

function toHistoryEntry(
  session: GuidedSession,
  state: GuidedSessionState,
  currentSessionId: string | null
): GuidedSessionHistoryEntry {
  const completedStepCount = session.steps.filter(
    (step) => state.steps[step.id]?.status === "complete"
  ).length;

  return {
    id: session.id,
    mode: session.mode,
    title: session.title,
    summary: session.summary,
    createdAt: session.createdAt,
    question: session.mode === "codebase_walkthrough" ? session.question : undefined,
    stepCount: session.steps.length,
    completedStepCount,
    status: completedStepCount === session.steps.length ? "complete" : "pending",
    isCurrent: currentSessionId === session.id
  };
}

async function readSessionIds(paths: ReturnType<typeof resolveGuidedPaths>): Promise<string[]> {
  const entries = await readdir(paths.sessionsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".recipe.json"))
    .map((entry) => entry.name.replace(/\.recipe\.json$/, ""));
}

async function loadSessionById(
  rootDir: string,
  sessionId: string,
  currentSession: GuidedSession | null
): Promise<GuidedSession> {
  if (currentSession?.id === sessionId) {
    return currentSession;
  }

  return guidedSessionSchema.parse(await readGuidedSession(rootDir, sessionId));
}

export async function listGuidedSessions(rootDir: string): Promise<GuidedSessionHistoryEntry[]> {
  const paths = await ensureGuidedDirectories(rootDir);
  const currentSession = await readCurrentSession(rootDir);
  const sessionIds = new Set(await readSessionIds(paths));

  if (currentSession) {
    sessionIds.add(currentSession.id);
  }

  const entries = await Promise.all(
    [...sessionIds].map(async (sessionId) => {
      const session = await loadSessionById(rootDir, sessionId, currentSession);
      const state = await readSessionStateForHistory(rootDir, session, currentSession?.id ?? null);
      return toHistoryEntry(session, state, currentSession?.id ?? null);
    })
  );

  return entries.sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export async function switchGuidedSession(
  rootDir: string,
  sessionId: string
): Promise<{ session: GuidedSession; state: GuidedSessionState }> {
  const paths = await ensureGuidedDirectories(rootDir);
  const currentSession = await readCurrentSession(rootDir);
  const session = await loadSessionById(rootDir, sessionId, currentSession);
  const state = await readSessionStateForHistory(rootDir, session, currentSession?.id ?? null);

  const recipePayload = `${JSON.stringify(session, null, 2)}\n`;
  const markdownPayload = renderSessionMarkdown(session);

  await writeFile(paths.currentRecipePath, recipePayload);
  await writeFile(paths.currentMarkdownPath, markdownPayload);
  await writeGuidedState(rootDir, state);

  return {
    session,
    state
  };
}
