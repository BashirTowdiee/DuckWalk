import type { GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import type { PresentationContext } from "./ImplementationPresentation";
import type { AutoCompleteContext } from "./ImplementationAutoComplete";
import type { GuidanceMode, WalkthroughDriftState, WebviewState } from "../sidebar/types";

export function createPresentationContext(params: {
  workspaceRoot: string;
  guidanceMode: GuidanceMode;
  guidedState: GuidedSessionState | null;
  getActiveStep: () => GuidedStep | undefined;
}): PresentationContext {
  return {
    workspaceRoot: params.workspaceRoot,
    guidanceMode: params.guidanceMode,
    guidedState: params.guidedState,
    getActiveStep: params.getActiveStep
  };
}

export function createAutoCompleteContext(params: {
  workspaceRoot: string;
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  getActiveStep: () => GuidedStep | undefined;
  setGuidedState: (state: GuidedSessionState) => void;
  setActiveStepId: (stepId: string | null) => void;
  applyStepDecorations: (editor: vscode.TextEditor) => Promise<void>;
  publishState: (error: string | null) => Promise<void>;
}): AutoCompleteContext {
  return {
    workspaceRoot: params.workspaceRoot,
    session: params.session,
    guidedState: params.guidedState,
    getActiveStep: params.getActiveStep,
    setGuidedState: params.setGuidedState,
    setActiveStepId: params.setActiveStepId,
    applyStepDecorations: params.applyStepDecorations,
    publishState: params.publishState
  };
}

export function createMutators(params: {
  setGuidedState: (state: GuidedSessionState) => void;
  setActiveStepId: (stepId: string | null) => void;
  setActiveEvidenceId: (evidenceId: string | null) => void;
}) {
  return params;
}

export function createStateSnapshot(params: {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
  activeEvidenceId: string | null;
}) {
  return params;
}

export function createWebviewState(params: {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
  activeEvidenceId: string | null;
  walkthroughDrift: WalkthroughDriftState | null;
  isPlaying: boolean;
  guidanceMode: GuidanceMode;
  tabAcceptEnabled: boolean;
  error: string | null;
}): WebviewState {
  return {
    session: params.session,
    guidedState: params.guidedState,
    activeStepId: params.activeStepId,
    activeEvidenceId: params.activeEvidenceId,
    walkthroughDrift: params.walkthroughDrift,
    isPlaying: params.isPlaying,
    guidanceMode: params.guidanceMode,
    tabAcceptEnabled: params.tabAcceptEnabled,
    error: params.error
  };
}
