import { readGuidedState, readGuidedSession } from "@duckwalk/core";

import { inspectWalkthroughDrift } from "../walkthroughDrift";
import { getActiveStep, getDefaultEvidenceId, getOrderedSteps } from "./stepState";

export async function loadSessionSnapshot(workspaceRoot: string) {
  const session = await readGuidedSession(workspaceRoot);
  const guidedState = await readGuidedState(workspaceRoot);
  const activeStepId = guidedState?.activeStepId ?? getOrderedSteps(session)[0]?.id ?? null;
  const activeEvidenceId = getDefaultEvidenceId(getActiveStep(session, activeStepId));
  const walkthroughDrift = await inspectWalkthroughDrift(workspaceRoot, session);

  return {
    session,
    guidedState,
    activeStepId,
    activeEvidenceId,
    walkthroughDrift
  };
}
