import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuidedSession, StepStatus } from "@guidedpatch/schema";
import { z } from "zod";

export const guidedPaths = {
  directoryName: ".guided-implementation",
  currentRecipeName: "current.recipe.json",
  currentMarkdownName: "current.recipe.md",
  stateName: "state.json",
  sessionsDirectoryName: "sessions"
} as const;

const stepStateSchema = z.object({
  status: z.enum(["pending", "active", "complete", "skipped"]),
  completedAt: z.string().optional()
});

export const guidedSessionStateSchema = z.object({
  sessionId: z.string().min(1),
  activeStepId: z.string().min(1).nullable(),
  activeStepOrder: z.number().int().positive().nullable(),
  updatedAt: z.string().min(1),
  steps: z.record(stepStateSchema)
});

export type GuidedSessionState = z.infer<typeof guidedSessionStateSchema>;

export function resolveGuidedPaths(rootDir: string) {
  const baseDir = path.join(rootDir, guidedPaths.directoryName);
  return {
    baseDir,
    currentRecipePath: path.join(baseDir, guidedPaths.currentRecipeName),
    currentMarkdownPath: path.join(baseDir, guidedPaths.currentMarkdownName),
    statePath: path.join(baseDir, guidedPaths.stateName),
    sessionsDir: path.join(baseDir, guidedPaths.sessionsDirectoryName)
  };
}

function getSessionStatePath(paths: ReturnType<typeof resolveGuidedPaths>, sessionId: string) {
  return path.join(paths.sessionsDir, `${sessionId}.state.json`);
}

export function createInitialSessionState(session: GuidedSession): GuidedSessionState {
  const orderedSteps = [...session.steps].sort((left, right) => left.order - right.order);
  const firstStep = orderedSteps[0] ?? null;
  const steps: GuidedSessionState["steps"] = {};

  for (const step of orderedSteps) {
    steps[step.id] = {
      status: step.id === firstStep?.id ? "active" : "pending"
    };
  }

  return {
    sessionId: session.id,
    activeStepId: firstStep?.id ?? null,
    activeStepOrder: firstStep?.order ?? null,
    updatedAt: new Date().toISOString(),
    steps
  };
}

export async function ensureGuidedDirectories(rootDir: string): Promise<ReturnType<typeof resolveGuidedPaths>> {
  const paths = resolveGuidedPaths(rootDir);
  await mkdir(paths.baseDir, { recursive: true });
  await mkdir(paths.sessionsDir, { recursive: true });
  return paths;
}

export async function readGuidedState(
  rootDir: string,
  sessionId?: string
): Promise<GuidedSessionState | null> {
  const paths = resolveGuidedPaths(rootDir);
  const statePath = sessionId ? getSessionStatePath(paths, sessionId) : paths.statePath;
  try {
    const raw = await readFile(statePath, "utf8");
    return guidedSessionStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeGuidedState(
  rootDir: string,
  state: GuidedSessionState,
  options: { writeCurrent?: boolean } = {}
): Promise<string> {
  const paths = await ensureGuidedDirectories(rootDir);
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  const payload = JSON.stringify(nextState, null, 2);
  const sessionStatePath = getSessionStatePath(paths, nextState.sessionId);

  await writeFile(sessionStatePath, payload);
  if (options.writeCurrent ?? true) {
    await writeFile(paths.statePath, payload);
    return paths.statePath;
  }

  return sessionStatePath;
}

export async function setActiveStep(
  rootDir: string,
  session: GuidedSession,
  stepId: string
): Promise<GuidedSessionState> {
  const existing = (await readGuidedState(rootDir, session.id)) ?? createInitialSessionState(session);
  const step = session.steps.find((candidate) => candidate.id === stepId);

  if (!step) {
    throw new Error(`Unknown step ID: ${stepId}`);
  }

  const nextSteps = { ...existing.steps };
  const previousActiveStepId = existing.activeStepId;
  if (previousActiveStepId && nextSteps[previousActiveStepId]?.status === "active") {
    nextSteps[previousActiveStepId] = { status: "pending" };
  }

  if (nextSteps[stepId]?.status !== "complete") {
    nextSteps[stepId] = { status: "active" };
  }

  const nextState: GuidedSessionState = {
    ...existing,
    sessionId: session.id,
    activeStepId: stepId,
    activeStepOrder: step.order,
    steps: nextSteps,
    updatedAt: new Date().toISOString()
  };

  await writeGuidedState(rootDir, nextState);
  return nextState;
}

export async function updateGuidedStepStatus(
  rootDir: string,
  session: GuidedSession,
  stepId: string,
  status: StepStatus,
  options: { writeCurrent?: boolean } = {}
): Promise<GuidedSessionState> {
  const existing = (await readGuidedState(rootDir, session.id)) ?? createInitialSessionState(session);
  const orderedSteps = [...session.steps].sort((left, right) => left.order - right.order);
  const currentIndex = orderedSteps.findIndex((step) => step.id === stepId);

  if (currentIndex === -1) {
    throw new Error(`Unknown step ID: ${stepId}`);
  }

  const nextSteps = {
    ...existing.steps,
    [stepId]: {
      status,
      completedAt: status === "complete" ? new Date().toISOString() : undefined
    }
  };

  let activeStepId = existing.activeStepId;
  let activeStepOrder = existing.activeStepOrder;

  if (status === "complete") {
    const nextStep = orderedSteps[currentIndex + 1];
    if (nextStep) {
      if (nextSteps[nextStep.id]?.status !== "complete") {
        nextSteps[nextStep.id] = { status: "active" };
      }
      activeStepId = nextStep.id;
      activeStepOrder = nextStep.order;
    } else {
      activeStepId = null;
      activeStepOrder = null;
    }
  }

  const nextState: GuidedSessionState = {
    sessionId: session.id,
    activeStepId,
    activeStepOrder,
    updatedAt: new Date().toISOString(),
    steps: nextSteps
  };

  await writeGuidedState(rootDir, nextState, options);
  return nextState;
}
