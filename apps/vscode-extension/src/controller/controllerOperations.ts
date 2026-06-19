import type { GuidedSession } from "@duckwalk/schema";
import * as vscode from "vscode";

import type { GuidanceMode, SidebarMessage } from "../sidebar/types";
import { loadSessionSnapshot } from "./sessionReload";
import { getOrderedSteps } from "./stepState";

export async function dispatchSidebarMessage(params: {
  message: SidebarMessage;
  startSession: () => Promise<void>;
  goToAdjacentStep: (offset: 1 | -1) => Promise<void>;
  togglePlayback: () => void;
  setGuidanceMode: (mode: GuidanceMode) => Promise<void>;
  toggleTabAccept: () => void;
  reloadSession: () => Promise<void>;
  completeActiveStep: () => Promise<void>;
  undoCompleteActiveStep: () => Promise<void>;
  setStepCompletion: (stepId: string, complete: boolean) => Promise<void>;
  selectEvidence: (stepId: string, evidenceId: string) => Promise<void>;
  activateStep: (stepId: string, evidenceId?: string | null) => Promise<void>;
  openFile: (path: string) => Promise<void>;
}): Promise<void> {
  switch (params.message.type) {
    case "start-session":
      return params.startSession();
    case "next-step":
      return params.goToAdjacentStep(1);
    case "previous-step":
      return params.goToAdjacentStep(-1);
    case "toggle-playback":
      return params.togglePlayback();
    case "set-guidance-mode":
      return params.setGuidanceMode(params.message.mode);
    case "toggle-tab-accept":
      return params.toggleTabAccept();
    case "refresh-session":
      return params.reloadSession();
    case "complete-step":
      return params.completeActiveStep();
    case "undo-complete-step":
      return params.undoCompleteActiveStep();
    case "set-step-completion":
      return params.setStepCompletion(params.message.stepId, params.message.complete);
    case "select-evidence":
      return params.selectEvidence(params.message.stepId, params.message.evidenceId);
    case "select-step":
      return params.activateStep(params.message.stepId, params.message.evidenceId);
    case "open-file":
      return params.openFile(params.message.path);
  }
}

export function getAdjacentStepId(
  session: GuidedSession | null,
  activeStepId: string | null,
  offset: 1 | -1
): string | null {
  const orderedSteps = getOrderedSteps(session);
  if (!orderedSteps.length) {
    return null;
  }

  const currentIndex = orderedSteps.findIndex((step) => step.id === activeStepId);
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.min(Math.max(currentIndex + offset, 0), orderedSteps.length - 1);
  return orderedSteps[nextIndex]?.id ?? null;
}

export async function reloadSessionAction(params: {
  workspaceRoot: string;
  onLoaded: (snapshot: Awaited<ReturnType<typeof loadSessionSnapshot>>) => Promise<void> | void;
  onMissing: (message: string) => Promise<void>;
  applyDecorations: (editor: vscode.TextEditor) => Promise<void>;
  maybeAutoComplete: () => Promise<void>;
  publishState: () => Promise<void>;
}) {
  try {
    const snapshot = await loadSessionSnapshot(params.workspaceRoot);
    await params.onLoaded(snapshot);
  } catch {
    await params.onMissing("No guided session is loaded.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    await params.applyDecorations(editor);
  }
  await params.maybeAutoComplete();
  await params.publishState();
}
