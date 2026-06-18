import {
  guidedSessionStateSchema,
  readGuidedSession,
  readGuidedState,
  updateGuidedStepStatus,
  validateSessionIntegrity,
  writeRecipeFiles
} from "@guidedpatch/core";
import {
  guidedSessionSchema,
  stepStatusSchema,
  type GuidedSession,
  type StepStatus
} from "@guidedpatch/schema";
import { z } from "zod";

const updateStepStatusInputSchema = z.object({
  sessionId: z.string().min(1),
  stepId: z.string().min(1),
  status: stepStatusSchema
});

export type CreateGuidedSessionResult = {
  sessionId: string;
  recipePath: string;
  markdownPath: string;
  statePath: string;
};

function validatePrReviewStepRanges(session: GuidedSession) {
  for (const step of session.steps) {
    if (
      step.mode !== "pr_review" ||
      ((step.location.strategy !== "range" || !step.location.range) && !step.review.changedRange)
    ) {
      throw new Error(
        `PR review step ${step.id} requires a location range or review.changedRange`
      );
    }
  }
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
