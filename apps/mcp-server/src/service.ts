import {
  guidedSessionStateSchema,
  readGuidedSession,
  readGuidedState,
  updateGuidedStepStatus,
  validateSessionIntegrity,
  writeRecipeFiles
} from "@duckwalk/core";
import {
  sessionModeSchema,
  guidedSessionSchema,
  stepStatusSchema,
  type GuidedSession,
  type SessionMode,
  type StepStatus
} from "@duckwalk/schema";
import { z } from "zod";

import { getDuckWalkContract } from "./contract";
import {
  validateCodebaseWalkthroughSession,
  validateCodebaseWalkthroughWorkspace,
  validatePrReviewStepRanges
} from "./walkthrough-validation";

const updateStepStatusInputSchema = z.object({
  sessionId: z.string().min(1),
  stepId: z.string().min(1),
  status: stepStatusSchema
});

const validateGuidedSessionInputSchema = z.object({
  session: guidedSessionSchema,
  expectMode: sessionModeSchema.optional()
});

export type CreateGuidedSessionResult = {
  sessionId: string;
  recipePath: string;
  markdownPath: string;
  statePath: string;
};

export { getDuckWalkContract };

export function validateGuidedSessionInput(input: {
  session: GuidedSession;
  expectMode?: SessionMode;
}) {
  const payload = validateGuidedSessionInputSchema.parse(input);
  const session = guidedSessionSchema.parse(payload.session);

  if (payload.expectMode && session.mode !== payload.expectMode) {
    throw new Error(`Expected session mode "${payload.expectMode}" but received "${session.mode}"`);
  }

  validateSessionIntegrity(session);
  if (session.mode === "pr_review") {
    validatePrReviewStepRanges(session);
  }
  if (session.mode === "codebase_walkthrough") {
    validateCodebaseWalkthroughSession(session);
  }

  return {
    valid: true,
    session: {
      id: session.id,
      mode: session.mode,
      title: session.title,
      summary: session.summary,
      stepCount: session.steps.length,
      files: session.steps.map((step) => step.file.path),
      locationStrategies: [...new Set(session.steps.map((step) => step.location.strategy))]
    }
  };
}
async function isCurrentSession(rootDir: string, sessionId: string): Promise<boolean> {
  try {
    const currentSession = await readGuidedSession(rootDir);
    return currentSession.id === sessionId;
  } catch {
    return false;
  }
}

export async function createGuidedSession(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);
  validateSessionIntegrity(session);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function createPrReviewSession(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);

  if (session.mode !== "pr_review") {
    throw new Error('create_pr_review_session requires mode "pr_review"');
  }

  validateSessionIntegrity(session);
  validatePrReviewStepRanges(session);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function pathfinder(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);

  if (session.mode !== "codebase_walkthrough") {
    throw new Error('pathfinder requires mode "codebase_walkthrough"');
  }

  validateSessionIntegrity(session);
  const walkthroughSteps = validateCodebaseWalkthroughSession(session);
  await validateCodebaseWalkthroughWorkspace(rootDir, walkthroughSteps);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function getGuidedSession(rootDir: string, sessionId?: string) {
  const session = guidedSessionSchema.parse(await readGuidedSession(rootDir, sessionId));
  let state = await readGuidedState(rootDir, sessionId);

  if (!state && sessionId && (await isCurrentSession(rootDir, sessionId))) {
    state = await readGuidedState(rootDir);
  }

  return {
    session,
    state: state ? guidedSessionStateSchema.parse(state) : null
  };
}

export async function updateStepStatus(
  rootDir: string,
  input: { sessionId: string; stepId: string; status: StepStatus }
) {
  const payload = updateStepStatusInputSchema.parse(input);
  const session = guidedSessionSchema.parse(await readGuidedSession(rootDir, payload.sessionId));

  if (session.id !== payload.sessionId) {
    throw new Error(`Session mismatch for ${payload.sessionId}`);
  }

  const state = await updateGuidedStepStatus(
    rootDir,
    session,
    payload.stepId,
    payload.status,
    {
      writeCurrent: await isCurrentSession(rootDir, session.id)
    }
  );

  return {
    sessionId: session.id,
    stepId: payload.stepId,
    status: payload.status,
    state: guidedSessionStateSchema.parse(state)
  };
}
