import { reopenGuidedStep, setActiveStep, undoGuidedStepCompletion, updateGuidedStepStatus, type GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { getDefaultEvidenceId, getOrderedSteps } from "./stepState";

type ActiveSessionState = {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
  activeEvidenceId: string | null;
};

type Mutators = {
  setGuidedState: (state: GuidedSessionState) => void;
  setActiveStepId: (stepId: string | null) => void;
  setActiveEvidenceId: (evidenceId: string | null) => void;
};

export async function activateStepAction(params: {
  workspaceRoot: string;
  state: ActiveSessionState;
  stepId: string;
  evidenceId?: string | null | undefined;
  mutators: Mutators;
  revealStep: (step: GuidedStep, evidenceId: string | null) => Promise<void>;
  maybeAutoComplete: () => Promise<void>;
  publishState: () => Promise<void>;
}): Promise<void> {
  if (!params.state.session) {
    return;
  }

  const step = params.state.session.steps.find((candidate) => candidate.id === params.stepId);
  if (!step) {
    return;
  }

  const nextState = await setActiveStep(params.workspaceRoot, params.state.session, step.id);
  params.mutators.setGuidedState(nextState);
  params.mutators.setActiveStepId(step.id);
  params.mutators.setActiveEvidenceId(params.evidenceId ?? getDefaultEvidenceId(step));
  await params.revealStep(step, params.evidenceId ?? getDefaultEvidenceId(step));
  await params.maybeAutoComplete();
  await params.publishState();
}

export async function selectEvidenceAction(params: {
  state: ActiveSessionState;
  stepId: string;
  evidenceId: string;
  setActiveStepId: (stepId: string) => void;
  setActiveEvidenceId: (evidenceId: string) => void;
  revealStep: (step: GuidedStep, evidenceId: string | null) => Promise<void>;
  publishState: () => Promise<void>;
}): Promise<void> {
  if (!params.state.session) {
    return;
  }

  const step = params.state.session.steps.find((candidate) => candidate.id === params.stepId);
  if (!step || step.mode !== "codebase_walkthrough") {
    return;
  }

  params.setActiveStepId(params.stepId);
  params.setActiveEvidenceId(params.evidenceId);
  await params.revealStep(step, params.evidenceId);
  await params.publishState();
}

export async function updateCompletionAction(params: {
  workspaceRoot: string;
  state: ActiveSessionState;
  stepId?: string;
  complete?: boolean;
  getActiveStep: () => GuidedStep | undefined;
  mutators: Mutators;
  revealStep: (step: GuidedStep, evidenceId: string | null) => Promise<void>;
  applyDecorations: (editor: vscode.TextEditor) => Promise<void>;
  publishState: () => Promise<void>;
}): Promise<void> {
  if (!params.state.session) {
    return;
  }

  if (params.stepId && params.complete !== undefined) {
    const step = params.state.session.steps.find((candidate) => candidate.id === params.stepId);
    if (!step || step.mode !== "implementation") {
      return;
    }

    if (params.complete) {
      const nextState = await updateGuidedStepStatus(
        params.workspaceRoot,
        params.state.session,
        step.id,
        "complete"
      );
      params.mutators.setGuidedState(nextState);
      params.mutators.setActiveStepId(nextState.activeStepId);
      params.mutators.setActiveEvidenceId(getDefaultEvidenceId(params.getActiveStep()));
    } else {
      const nextState = await reopenGuidedStep(params.workspaceRoot, params.state.session, step.id);
      params.mutators.setGuidedState(nextState);
      params.mutators.setActiveStepId(step.id);
      params.mutators.setActiveEvidenceId(getDefaultEvidenceId(step));
      await params.revealStep(step, getDefaultEvidenceId(step));
    }
  } else {
    const step = params.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return;
    }

    const nextState = params.complete === false
      ? await undoGuidedStepCompletion(params.workspaceRoot, params.state.session, step.id)
      : await updateGuidedStepStatus(params.workspaceRoot, params.state.session, step.id, "complete");
    params.mutators.setGuidedState(nextState);
    params.mutators.setActiveStepId(nextState.activeStepId ?? step.id);
    params.mutators.setActiveEvidenceId(getDefaultEvidenceId(params.getActiveStep()));
    if (params.complete === false) {
      await params.revealStep(step, getDefaultEvidenceId(params.getActiveStep()));
    }
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    await params.applyDecorations(editor);
  }
  await params.publishState();
}

export async function advancePlaybackAction(params: {
  session: GuidedSession | null;
  activeStepId: string | null;
  activateStep: (stepId: string) => Promise<void>;
  stopPlayback: () => void;
  publishState: () => Promise<void>;
}): Promise<void> {
  const orderedSteps = getOrderedSteps(params.session);
  const currentIndex = orderedSteps.findIndex((step) => step.id === params.activeStepId);
  if (currentIndex === -1) {
    if (orderedSteps[0]) {
      await params.activateStep(orderedSteps[0].id);
    }
    return;
  }

  const nextStep = orderedSteps[currentIndex + 1];
  if (!nextStep) {
    params.stopPlayback();
    await params.publishState();
    return;
  }

  await params.activateStep(nextStep.id);
}
