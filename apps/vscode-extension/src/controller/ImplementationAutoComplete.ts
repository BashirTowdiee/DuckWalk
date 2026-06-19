import path from "node:path";

import { updateGuidedStepStatus, type GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { validateStepAgainstEditorDocument } from "./implementationSupport";

type ImplementationStep = Extract<GuidedStep, { mode: "implementation" }>;

export type AutoCompleteContext = {
  workspaceRoot: string;
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  getActiveStep: () => GuidedStep | undefined;
  setGuidedState: (state: GuidedSessionState) => void;
  setActiveStepId: (stepId: string | null) => void;
  applyStepDecorations: (editor: vscode.TextEditor) => Promise<void>;
  publishState: (error: string | null) => Promise<void>;
};

export class ImplementationAutoComplete {
  private autoCompleteTimer: NodeJS.Timeout | null = null;

  dispose(): void {
    this.clearPendingAutoComplete();
  }

  async maybeAutoCompleteActiveStep(
    document: vscode.TextDocument | undefined,
    context: AutoCompleteContext
  ): Promise<boolean> {
    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation" || !context.session) {
      return false;
    }
    if (context.guidedState?.steps[step.id]?.status === "complete") {
      return false;
    }

    const targetDocument = await this.resolveTargetDocument(document, step, context.workspaceRoot);
    if (!targetDocument || !validateStepAgainstEditorDocument(step, targetDocument)) {
      return false;
    }

    const nextState = await updateGuidedStepStatus(
      context.workspaceRoot,
      context.session,
      step.id,
      "complete"
    );
    context.setGuidedState(nextState);
    context.setActiveStepId(nextState.activeStepId);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await context.applyStepDecorations(editor);
    }

    return true;
  }

  async handleDocumentChange(
    event: vscode.TextDocumentChangeEvent,
    context: AutoCompleteContext
  ): Promise<void> {
    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation" || !context.session) {
      return;
    }

    const expectedPath = path.join(context.workspaceRoot, step.file.path);
    if (event.document.uri.fsPath !== expectedPath) {
      return;
    }

    const isComplete = validateStepAgainstEditorDocument(step, event.document);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await context.applyStepDecorations(editor);
    }
    if (!isComplete) {
      this.clearPendingAutoComplete();
      return;
    }

    this.scheduleAutoCompleteActiveStep(event.document, context);
  }

  private scheduleAutoCompleteActiveStep(
    document: vscode.TextDocument,
    context: AutoCompleteContext,
    delayMs = 180
  ) {
    this.clearPendingAutoComplete();
    this.autoCompleteTimer = setTimeout(() => {
      this.autoCompleteTimer = null;
      void this.completeAfterSettledChange(document, context);
    }, delayMs);
  }

  private async completeAfterSettledChange(
    document: vscode.TextDocument,
    context: AutoCompleteContext
  ) {
    const didComplete = await this.maybeAutoCompleteActiveStep(document, context);
    if (didComplete) {
      await context.publishState(null);
    }
  }

  private async resolveTargetDocument(
    document: vscode.TextDocument | undefined,
    step: ImplementationStep,
    workspaceRoot: string
  ): Promise<vscode.TextDocument | null> {
    const expectedPath = path.join(workspaceRoot, step.file.path);
    if (document && document.uri.fsPath === expectedPath) {
      return document;
    }

    try {
      return await vscode.workspace.openTextDocument(expectedPath);
    } catch {
      return null;
    }
  }

  private clearPendingAutoComplete() {
    if (this.autoCompleteTimer) {
      clearTimeout(this.autoCompleteTimer);
      this.autoCompleteTimer = null;
    }
  }
}
