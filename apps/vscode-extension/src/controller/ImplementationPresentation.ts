import path from "node:path";

import type { GuidedSessionState } from "@duckwalk/core";
import type { GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { DuckWalkPreviewProvider } from "../DuckWalkPreviewProvider";
import type { GuidanceMode } from "../sidebar/types";
import {
  buildGuidedDiffPreview,
  getAdaptedGhostCode,
  getRemainingGhostCode
} from "./implementationSupport";
import { resolveImplementationInsertionPosition } from "./editorNavigation";

type ImplementationStep = Extract<GuidedStep, { mode: "implementation" }>;

export type PresentationContext = {
  workspaceRoot: string;
  guidanceMode: GuidanceMode;
  guidedState: GuidedSessionState | null;
  getActiveStep: () => GuidedStep | undefined;
};

export class ImplementationPresentation {
  private suggestRefreshTimer: NodeJS.Timeout | null = null;
  private hoverRefreshTimer: NodeJS.Timeout | null = null;
  private peekRefreshTimer: NodeJS.Timeout | null = null;
  private diffRefreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly previewProvider: DuckWalkPreviewProvider,
    private readonly ghostTextDecorationType: vscode.TextEditorDecorationType,
    private readonly diffPreviewDecorationType: vscode.TextEditorDecorationType
  ) {}

  dispose(): void {
    this.clearTimer("suggestRefreshTimer");
    this.clearTimer("hoverRefreshTimer");
    this.clearTimer("peekRefreshTimer");
    this.clearTimer("diffRefreshTimer");
  }

  async refreshVisibleGuidance(
    editor: vscode.TextEditor | undefined,
    context: PresentationContext
  ): Promise<void> {
    await vscode.commands.executeCommand("hideSuggestWidget");
    if (!editor) {
      return;
    }

    this.queueGuidanceRefresh(editor, context);
  }

  queueGuidanceRefresh(editor: vscode.TextEditor, context: PresentationContext) {
    switch (context.guidanceMode) {
      case "diff":
        this.queueDiffRefresh(editor, context);
        break;
      case "inline":
        this.applyInlineGhostText(editor, context);
        break;
      case "suggest":
        this.queueSuggestWidgetRefresh(editor, context);
        break;
      case "hover":
        this.queueHoverRefresh(editor, context);
        break;
      case "peek":
        this.queuePeekRefresh(editor, context);
        break;
    }
  }

  getActiveImplementationCompletion(
    editor: vscode.TextEditor,
    position: vscode.Position | undefined,
    context: PresentationContext
  ): vscode.CompletionItem | null {
    if (context.guidanceMode !== "suggest") {
      return null;
    }

    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }

    if (!this.isActiveImplementationStep(step, editor, context.guidedState)) {
      return null;
    }

    const insertionPosition = resolveImplementationInsertionPosition(editor.document, step);
    const activePosition = position ?? editor.selection.active;
    if (
      editor.selection.anchor.line !== activePosition.line ||
      editor.selection.anchor.character !== activePosition.character
    ) {
      return null;
    }
    if (editor.document.offsetAt(activePosition) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const remainingGhostCode = getRemainingGhostCode(editor, insertionPosition, step.ghostCode);
    if (!remainingGhostCode) {
      return null;
    }

    const previewLine =
      remainingGhostCode.split("\n").find((line) => line.trim().length > 0) ??
      remainingGhostCode;
    const typedPrefix = editor.document
      .getText()
      .slice(
        editor.document.offsetAt(insertionPosition),
        editor.document.offsetAt(activePosition)
      )
      .replace(/\r\n/g, "\n");

    const item = new vscode.CompletionItem(
      {
        label: previewLine,
        description: "duckWalk"
      },
      vscode.CompletionItemKind.Snippet
    );
    item.insertText = remainingGhostCode;
    item.filterText = `${typedPrefix}${remainingGhostCode}`;
    item.range = new vscode.Range(activePosition, activePosition);
    item.sortText = "0000";
    item.preselect = true;
    item.detail = "duckWalk step suggestion";
    item.documentation = new vscode.MarkdownString(
      "Suggested remainder for the active guided step."
    );
    return item;
  }

  getActiveImplementationHover(
    editor: vscode.TextEditor,
    position: vscode.Position,
    context: PresentationContext
  ): vscode.Hover | null {
    if (context.guidanceMode !== "hover") {
      return null;
    }

    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }
    if (!this.isActiveImplementationStep(step, editor, context.guidedState)) {
      return null;
    }

    const insertionPosition = resolveImplementationInsertionPosition(editor.document, step);
    if (editor.document.offsetAt(position) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(`**duckWalk**\n\n${step.explanation.title}\n\n`);
    markdown.appendCodeblock(getAdaptedGhostCode(editor, step.ghostCode), editor.document.languageId);
    markdown.isTrusted = false;
    return new vscode.Hover(markdown, new vscode.Range(position, position));
  }

  applyDiffPreviewDecorations(editor: vscode.TextEditor) {
    if (editor.document.uri.scheme !== "duckwalk-preview") {
      return;
    }

    editor.setDecorations(
      this.diffPreviewDecorationType,
      this.previewProvider.getHighlightRanges(editor.document.uri)
    );
  }

  private applyInlineGhostText(editor: vscode.TextEditor, context: PresentationContext) {
    const decoration = this.getActiveImplementationGhostDecoration(editor, context);
    editor.setDecorations(this.ghostTextDecorationType, decoration ? [decoration] : []);
  }

  private getActiveImplementationGhostDecoration(
    editor: vscode.TextEditor,
    context: PresentationContext
  ): vscode.DecorationOptions | null {
    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }
    if (!this.isActiveImplementationStep(step, editor, context.guidedState)) {
      return null;
    }
    if (editor.selections.length !== 1 || !editor.selection.isEmpty) {
      return null;
    }

    const insertionPosition = resolveImplementationInsertionPosition(editor.document, step);
    const activePosition = editor.selection.active;
    if (editor.document.offsetAt(activePosition) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const remainingGhostCode = getRemainingGhostCode(editor, insertionPosition, step.ghostCode);
    if (!remainingGhostCode) {
      return null;
    }

    const firstLine = remainingGhostCode.split("\n")[0] ?? remainingGhostCode;
    if (!firstLine) {
      return null;
    }

    const line = editor.document.lineAt(activePosition.line);
    let anchorRange: vscode.Range;
    let renderOptions: vscode.DecorationInstanceRenderOptions;

    if (activePosition.character > 0) {
      const rangeStart = activePosition.translate(0, -1);
      anchorRange = new vscode.Range(rangeStart, activePosition);
      renderOptions = { after: { contentText: firstLine } };
    } else if (!line.isEmptyOrWhitespace && line.text.length > 0) {
      const rangeEnd = activePosition.translate(0, 1);
      anchorRange = new vscode.Range(activePosition, rangeEnd);
      renderOptions = { before: { contentText: firstLine } };
    } else {
      anchorRange = new vscode.Range(activePosition, activePosition);
      renderOptions = { after: { contentText: firstLine } };
    }

    return {
      range: anchorRange,
      hoverMessage: new vscode.MarkdownString().appendCodeblock(
        remainingGhostCode,
        editor.document.languageId
      ),
      renderOptions
    };
  }

  private queueSuggestWidgetRefresh(
    editor: vscode.TextEditor,
    context: PresentationContext
  ) {
    this.resetTimer("suggestRefreshTimer", () => {
      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      const completion = this.getActiveImplementationCompletion(editor, undefined, context);
      void vscode.commands.executeCommand(
        completion ? "editor.action.triggerSuggest" : "hideSuggestWidget"
      );
    });
  }

  private queueHoverRefresh(editor: vscode.TextEditor, context: PresentationContext) {
    this.resetTimer("hoverRefreshTimer", () => {
      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      const hover = this.getActiveImplementationHover(editor, editor.selection.active, context);
      if (hover) {
        void vscode.commands.executeCommand("editor.action.showHover");
      }
    });
  }

  private queuePeekRefresh(editor: vscode.TextEditor, context: PresentationContext) {
    this.resetTimer("peekRefreshTimer", () => {
      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      void this.showPeekPreview(editor, context);
    });
  }

  private queueDiffRefresh(editor: vscode.TextEditor, context: PresentationContext) {
    this.resetTimer("diffRefreshTimer", () => {
      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      void this.showDiffPreview(editor, context);
    });
  }

  private async showPeekPreview(
    editor: vscode.TextEditor,
    context: PresentationContext
  ): Promise<void> {
    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return;
    }
    if (!this.isActiveImplementationStep(step, editor, context.guidedState)) {
      return;
    }

    const previewUri = this.getPreviewUri(step, "peek");
    this.previewProvider.update(previewUri, getAdaptedGhostCode(editor, step.ghostCode));

    const document = await vscode.workspace.openTextDocument(previewUri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true
    });
  }

  private async showDiffPreview(
    editor: vscode.TextEditor,
    context: PresentationContext
  ): Promise<void> {
    const step = context.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return;
    }
    if (!this.isActiveImplementationStep(step, editor, context.guidedState)) {
      return;
    }

    const diffPreview = buildGuidedDiffPreview(editor, step);
    if (!diffPreview) {
      return;
    }

    const previewUri = this.getPreviewUri(step, "diff");
    this.previewProvider.update(previewUri, diffPreview.content, diffPreview.highlightRanges);

    let previewEditor = vscode.window.visibleTextEditors.find(
      (visibleEditor) => visibleEditor.document.uri.toString() === previewUri.toString()
    );
    if (!previewEditor) {
      const document = await vscode.workspace.openTextDocument(previewUri);
      await vscode.languages.setTextDocumentLanguage(document, editor.document.languageId);
      previewEditor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: true
      });
    }

    this.applyDiffPreviewDecorations(previewEditor);
  }

  private getPreviewUri(step: GuidedStep, mode: "peek" | "diff"): vscode.Uri {
    const extension = path.extname(step.file.path) || ".txt";
    const safePath = step.file.path.replace(/[\\]/g, "/");
    return vscode.Uri.from({
      scheme: "duckwalk-preview",
      path: `/${mode}/${safePath}${extension.endsWith(path.extname(safePath)) ? "" : extension}`
    });
  }

  private isActiveImplementationStep(
    step: ImplementationStep,
    editor: vscode.TextEditor,
    guidedState: GuidedSessionState | null
  ): boolean {
    return (
      editor.document.uri.fsPath === path.join(this.workspaceRoot, step.file.path) &&
      guidedState?.steps[step.id]?.status !== "complete"
    );
  }

  private resetTimer(
    key:
      | "suggestRefreshTimer"
      | "hoverRefreshTimer"
      | "peekRefreshTimer"
      | "diffRefreshTimer",
    callback: () => void
  ) {
    this.clearTimer(key);
    this[key] = setTimeout(() => {
      this[key] = null;
      callback();
    }, 0);
  }

  private clearTimer(
    key:
      | "suggestRefreshTimer"
      | "hoverRefreshTimer"
      | "peekRefreshTimer"
      | "diffRefreshTimer"
  ) {
    if (this[key]) {
      clearTimeout(this[key]);
      this[key] = null;
    }
  }
}
