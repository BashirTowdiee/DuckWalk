import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuidedRange, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import type { GuidanceMode } from "../sidebar/types";
import { getWalkthroughSubrange } from "./stepState";

export type StepDecorationState = {
  lastDecoratedEditor: vscode.TextEditor | null;
};

type DecorationTypes = {
  highlightDecorationType: vscode.TextEditorDecorationType;
  activeEvidenceDecorationType: vscode.TextEditorDecorationType;
  ghostTextDecorationType: vscode.TextEditorDecorationType;
};

export function rangeFromGuidedRange(
  document: vscode.TextDocument,
  range: GuidedRange
): vscode.Range {
  const startLine = Math.min(range.startLine - 1, Math.max(document.lineCount - 1, 0));
  const endLine = Math.min(range.endLine - 1, Math.max(document.lineCount - 1, 0));
  const start = new vscode.Position(startLine, range.startCharacter);
  const end = new vscode.Position(endLine, range.endCharacter);
  return new vscode.Range(start, end);
}

export function resolveRange(document: vscode.TextDocument, step: GuidedStep): vscode.Range {
  if (step.mode === "pr_review" && step.review.changedRange) {
    return rangeFromGuidedRange(document, step.review.changedRange);
  }

  if (step.location.strategy === "range" && step.location.range) {
    return rangeFromGuidedRange(document, step.location.range);
  }

  if (step.location.strategy === "line" && step.location.line) {
    const lineIndex = Math.min(step.location.line - 1, Math.max(document.lineCount - 1, 0));
    const line = document.lineAt(lineIndex);
    const start = new vscode.Position(lineIndex, step.location.column ?? 0);
    return new vscode.Range(start, line.range.end);
  }

  if (
    (step.location.strategy === "after_text" || step.location.strategy === "before_text") &&
    step.location.anchorText
  ) {
    const index = document.getText().indexOf(step.location.anchorText);
    if (index >= 0) {
      const start = document.positionAt(index);
      const end = document.positionAt(index + step.location.anchorText.length);
      return new vscode.Range(start, end);
    }
  }

  const start = new vscode.Position(0, 0);
  return new vscode.Range(start, start);
}

export function resolveFocusRange(
  document: vscode.TextDocument,
  step: GuidedStep,
  evidenceId?: string | null
): vscode.Range {
  const evidence = getWalkthroughSubrange(step, evidenceId ?? null);
  if (evidence) {
    return rangeFromGuidedRange(document, evidence.range);
  }

  return resolveRange(document, step);
}

export function resolveHighlightRanges(
  document: vscode.TextDocument,
  step: GuidedStep
): vscode.Range[] {
  return step.mode === "codebase_walkthrough" && step.subranges?.length
    ? step.subranges.map((subrange) => rangeFromGuidedRange(document, subrange.range))
    : [resolveRange(document, step)];
}

export function resolveImplementationInsertionPosition(
  document: vscode.TextDocument,
  step: GuidedStep
): vscode.Position {
  if (step.location.strategy === "range" && step.location.range) {
    return rangeFromGuidedRange(document, step.location.range).start;
  }

  if (step.location.strategy === "line" && step.location.line) {
    const lineIndex = Math.min(step.location.line - 1, Math.max(document.lineCount - 1, 0));
    return new vscode.Position(lineIndex, step.location.column ?? 0);
  }

  if (
    (step.location.strategy === "after_text" || step.location.strategy === "before_text") &&
    step.location.anchorText
  ) {
    const index = document.getText().indexOf(step.location.anchorText);
    if (index >= 0) {
      return step.location.strategy === "after_text"
        ? document.positionAt(index + step.location.anchorText.length)
        : document.positionAt(index);
    }
  }

  return new vscode.Position(0, 0);
}

export function clearStepDecorations(
  state: StepDecorationState,
  decorationTypes: DecorationTypes
): StepDecorationState {
  state.lastDecoratedEditor?.setDecorations(decorationTypes.highlightDecorationType, []);
  state.lastDecoratedEditor?.setDecorations(decorationTypes.activeEvidenceDecorationType, []);
  state.lastDecoratedEditor?.setDecorations(decorationTypes.ghostTextDecorationType, []);
  return {
    lastDecoratedEditor: null
  };
}

export async function applyStepDecorations(params: {
  editor: vscode.TextEditor;
  step: GuidedStep | undefined;
  workspaceRoot: string;
  activeEvidenceId: string | null;
  guidanceMode: GuidanceMode;
  state: StepDecorationState;
  decorationTypes: DecorationTypes;
  queueGuidanceRefresh: (editor: vscode.TextEditor) => void;
}): Promise<StepDecorationState> {
  const { editor, step, workspaceRoot, activeEvidenceId, guidanceMode, decorationTypes } = params;
  const clearedState = clearStepDecorations(params.state, decorationTypes);

  if (!step || editor.document.uri.fsPath !== path.join(workspaceRoot, step.file.path)) {
    if (guidanceMode === "suggest") {
      void vscode.commands.executeCommand("hideSuggestWidget");
    }
    return clearedState;
  }

  const ranges = resolveHighlightRanges(editor.document, step);
  editor.setDecorations(decorationTypes.highlightDecorationType, ranges);
  const activeEvidence = getWalkthroughSubrange(step, activeEvidenceId);
  editor.setDecorations(
    decorationTypes.activeEvidenceDecorationType,
    activeEvidence ? [rangeFromGuidedRange(editor.document, activeEvidence.range)] : []
  );

  if (step.mode === "implementation") {
    params.queueGuidanceRefresh(editor);
  } else if (guidanceMode === "suggest") {
    void vscode.commands.executeCommand("hideSuggestWidget");
  }

  return {
    lastDecoratedEditor: editor
  };
}

export async function revealStepInEditor(params: {
  workspaceRoot: string;
  step: GuidedStep;
  evidenceId: string | null;
  speak: (step: GuidedStep) => Promise<void>;
  applyDecorations: (editor: vscode.TextEditor) => Promise<void>;
}): Promise<void> {
  const filePath = path.join(params.workspaceRoot, params.step.file.path);

  if (params.step.file.createIfMissing) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "", { flag: "a" });
  }

  const document = await vscode.workspace.openTextDocument(filePath);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false
  });
  const range = resolveFocusRange(document, params.step, params.evidenceId);
  if (params.step.mode === "implementation") {
    const insertionPosition = resolveImplementationInsertionPosition(document, params.step);
    editor.selection = new vscode.Selection(insertionPosition, insertionPosition);
  } else {
    editor.selection = new vscode.Selection(range.start, range.end);
  }
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  await params.speak(params.step);
  await params.applyDecorations(editor);
}

export async function openWorkspaceFile(
  workspaceRoot: string,
  filePath: string
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(path.join(workspaceRoot, filePath));
  await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false
  });
}
