import {
  extractValidationWindow,
  getValidationText,
  normaliseCode,
  validateExpectedCode,
  validateStepAgainstContent
} from "@duckwalk/core";
import type { GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { buildGuidancePreviewFromAnchor, matchGhostCodePrefix } from "../guidance-matching";
import { adaptCodeIndentation, type IndentationPreference } from "../indentation";
import { resolveImplementationInsertionPosition } from "./editorNavigation";

type ImplementationStep = Extract<GuidedStep, { mode: "implementation" }>;

export function getEditorIndentationPreference(
  editor: vscode.TextEditor
): IndentationPreference {
  const insertSpacesOption = editor.options.insertSpaces;
  const tabSizeOption = editor.options.tabSize;
  const insertSpaces =
    insertSpacesOption === "auto"
      ? inferInsertSpaces(editor.document)
      : insertSpacesOption !== false;
  const tabSize =
    typeof tabSizeOption === "number"
      ? tabSizeOption
      : inferTabSize(editor.document, insertSpaces);

  return {
    insertSpaces,
    tabSize: Math.max(tabSize, 1)
  };
}

export function getAdaptedGhostCode(
  editor: vscode.TextEditor,
  ghostCode: string
): string {
  return adaptCodeIndentation(ghostCode, getEditorIndentationPreference(editor));
}

export function getRemainingGhostCode(
  editor: vscode.TextEditor,
  position: vscode.Position,
  ghostCode: string
): string | null {
  const document = editor.document;
  const anchorOffset = document.offsetAt(position);
  const documentTextFromAnchor = document.getText().slice(anchorOffset).replace(/\r\n/g, "\n");
  const cursorOffset = Math.max(anchorOffset, document.offsetAt(editor.selection.active));
  const typedPrefix = document.getText().slice(anchorOffset, cursorOffset).replace(/\r\n/g, "\n");
  const normalisedGhostCode = getAdaptedGhostCode(editor, ghostCode)
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "");

  if (normaliseCode(documentTextFromAnchor).includes(normaliseCode(normalisedGhostCode))) {
    return null;
  }

  const { expectedIndex } = matchGhostCodePrefix(typedPrefix, normalisedGhostCode);
  const remainingGhostCode = normalisedGhostCode.slice(expectedIndex);
  return remainingGhostCode || null;
}

export function buildGuidedDiffPreview(
  editor: vscode.TextEditor,
  step: ImplementationStep
): { content: string; highlightRanges: vscode.Range[] } | null {
  const document = editor.document;
  const insertionPosition = resolveImplementationInsertionPosition(document, step);
  const anchorOffset = document.offsetAt(insertionPosition);
  const cursorOffset = Math.max(anchorOffset, document.offsetAt(editor.selection.active));
  const originalText = document.getText();
  const preview = buildGuidancePreviewFromAnchor({
    actualPrefix: originalText.slice(anchorOffset, cursorOffset),
    actualSuffix: originalText.slice(cursorOffset),
    ghostCode: getAdaptedGhostCode(editor, step.ghostCode)
  });

  if (!preview) {
    return {
      content: originalText,
      highlightRanges: []
    };
  }

  const previewDocumentText = `${originalText.slice(0, anchorOffset)}${preview.mergedText}`;
  const highlightRange = rangeFromOffsets(
    previewDocumentText,
    anchorOffset + preview.insertedStart,
    anchorOffset + preview.insertedEnd
  );

  return {
    content: previewDocumentText,
    highlightRanges: highlightRange ? [highlightRange] : []
  };
}

export function validateStepAgainstEditorDocument(
  step: ImplementationStep,
  document: vscode.TextDocument
): boolean {
  const editor =
    vscode.window.visibleTextEditors.find((candidate) => candidate.document === document) ??
    (vscode.window.activeTextEditor?.document === document
      ? vscode.window.activeTextEditor
      : null);

  if (!editor) {
    return validateStepAgainstContent(step, document.getText());
  }

  const expectedText = adaptCodeIndentation(
    getValidationText(step),
    getEditorIndentationPreference(editor)
  );
  const validationWindow = extractValidationWindow(
    document.getText(),
    step.location,
    step.validation
  );
  return validateExpectedCode(validationWindow, expectedText);
}

function inferInsertSpaces(document: vscode.TextDocument): boolean {
  for (const line of document.getText().replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("\t")) {
      return false;
    }

    if (line.startsWith(" ")) {
      return true;
    }
  }

  return true;
}

function inferTabSize(document: vscode.TextDocument, insertSpaces: boolean): number {
  if (!insertSpaces) {
    return 2;
  }

  for (const line of document.getText().replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^( +)\S/);
    if (match?.[1]) {
      return Math.max(match[1].length, 1);
    }
  }

  return 2;
}

function rangeFromOffsets(
  text: string,
  startOffset: number,
  endOffset: number
): vscode.Range | null {
  if (endOffset <= startOffset) {
    return null;
  }

  const start = positionFromOffset(text, startOffset);
  const end = positionFromOffset(text, endOffset);
  return new vscode.Range(start, end);
}

function positionFromOffset(text: string, offset: number): vscode.Position {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, safeOffset);
  const lines = prefix.split("\n");
  const line = Math.max(lines.length - 1, 0);
  const character = lines.at(-1)?.length ?? 0;
  return new vscode.Position(line, character);
}
