import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  extractValidationWindow,
  getValidationText,
  normaliseCode,
  readGuidedState,
  readGuidedSession,
  reopenGuidedStep,
  resolveGuidedPaths,
  setActiveStep,
  undoGuidedStepCompletion,
  updateGuidedStepStatus,
  validateExpectedCode,
  validateStepAgainstContent
} from "@duckwalk/core";
import type { GuidedSessionState } from "@duckwalk/core";
import type { GuidedRange, GuidedSession, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { buildGuidancePreviewFromAnchor, matchGhostCodePrefix } from "./guidance-matching";
import { adaptCodeIndentation, type IndentationPreference } from "./indentation";
import { DuckWalkViewProvider } from "./sidebar/DuckWalkViewProvider";
import type {
  GuidanceMode,
  SidebarController,
  SidebarMessage,
  WebviewState
} from "./sidebar/types";
import { NoopStepNarrator } from "./speech/narrator";

type ImplementationStep = Extract<GuidedStep, { mode: "implementation" }>;

class DuckWalkPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly contents = new Map<string, string>();
  private readonly highlightRanges = new Map<string, vscode.Range[]>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "No active duckWalk preview.";
  }

  update(uri: vscode.Uri, content: string, ranges: vscode.Range[] = []): void {
    this.contents.set(uri.toString(), content);
    this.highlightRanges.set(uri.toString(), ranges);
    this.onDidChangeEmitter.fire(uri);
  }

  getHighlightRanges(uri: vscode.Uri): vscode.Range[] {
    return this.highlightRanges.get(uri.toString()) ?? [];
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    this.contents.clear();
    this.highlightRanges.clear();
  }
}

class DuckWalkController implements SidebarController, vscode.Disposable {
  private readonly narrator = new NoopStepNarrator();
  private readonly highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
    border: "1px solid rgba(128, 128, 128, 0.35)"
  });
  private readonly ghostTextDecorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
      color: new vscode.ThemeColor("editorGhostText.foreground"),
      fontStyle: "italic",
      margin: "0 0 0 0.2ch"
    }
  });
  private readonly diffPreviewDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("diffEditor.insertedLineBackground"),
    border: "1px solid rgba(90, 200, 120, 0.25)"
  });
  private readonly disposables: vscode.Disposable[] = [];
  private session: GuidedSession | null = null;
  private guidedState: GuidedSessionState | null = null;
  private activeStepId: string | null = null;
  private isPlaying = false;
  private guidanceMode: GuidanceMode = "diff";
  private tabAcceptEnabled = false;
  private playbackTimer: NodeJS.Timeout | null = null;
  private viewProvider: DuckWalkViewProvider | null = null;
  private lastDecoratedEditor: vscode.TextEditor | null = null;
  private suggestRefreshTimer: NodeJS.Timeout | null = null;
  private hoverRefreshTimer: NodeJS.Timeout | null = null;
  private peekRefreshTimer: NodeJS.Timeout | null = null;
  private diffRefreshTimer: NodeJS.Timeout | null = null;
  private autoCompleteTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceUri: vscode.Uri,
    private readonly previewProvider: DuckWalkPreviewProvider
  ) {}

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        void this.handleDocumentChange(event);
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          void this.applyStepDecorations(event.textEditor);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.applyDiffPreviewDecorations(editor);
          void this.applyStepDecorations(editor);
        }
      })
    );

    const recipeWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceUri, ".guided-implementation/*.json")
    );

    this.disposables.push(
      recipeWatcher,
      recipeWatcher.onDidCreate(() => {
        void this.reloadSession();
      }),
      recipeWatcher.onDidChange(() => {
        void this.reloadSession();
      }),
      recipeWatcher.onDidDelete(() => {
        void this.reloadSession();
      })
    );

    context.subscriptions.push(this);
    this.syncTabAcceptContext();
    await this.reloadSession();
  }

  setViewProvider(provider: DuckWalkViewProvider) {
    this.viewProvider = provider;
  }

  dispose(): void {
    this.stopPlayback();
    this.clearDecorations();
    this.highlightDecorationType.dispose();
    this.ghostTextDecorationType.dispose();
    this.diffPreviewDecorationType.dispose();
    if (this.suggestRefreshTimer) {
      clearTimeout(this.suggestRefreshTimer);
      this.suggestRefreshTimer = null;
    }
    if (this.hoverRefreshTimer) {
      clearTimeout(this.hoverRefreshTimer);
      this.hoverRefreshTimer = null;
    }
    if (this.peekRefreshTimer) {
      clearTimeout(this.peekRefreshTimer);
      this.peekRefreshTimer = null;
    }
    if (this.diffRefreshTimer) {
      clearTimeout(this.diffRefreshTimer);
      this.diffRefreshTimer = null;
    }
    if (this.autoCompleteTimer) {
      clearTimeout(this.autoCompleteTimer);
      this.autoCompleteTimer = null;
    }
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  async handleSidebarMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case "start-session":
        await this.startSession();
        break;
      case "next-step":
        await this.goToAdjacentStep(1);
        break;
      case "previous-step":
        await this.goToAdjacentStep(-1);
        break;
      case "toggle-playback":
        this.togglePlayback();
        break;
      case "set-guidance-mode":
        this.setGuidanceMode(message.mode);
        break;
      case "toggle-tab-accept":
        this.toggleTabAccept();
        break;
      case "refresh-session":
        await this.reloadSession();
        break;
      case "complete-step":
        await this.completeActiveStep();
        break;
      case "undo-complete-step":
        await this.undoCompleteActiveStep();
        break;
      case "set-step-completion":
        await this.setStepCompletion(message.stepId, message.complete);
        break;
      case "select-step":
        await this.activateStep(message.stepId);
        break;
    }
  }

  async startSession(): Promise<void> {
    if (!this.session) {
      await this.reloadSession();
    }

    const step = this.getOrderedSteps()[0];
    if (step) {
      await this.activateStep(step.id);
    }
  }

  async reloadSession(): Promise<void> {
    const paths = resolveGuidedPaths(this.workspaceRoot);

    try {
      this.session = await readGuidedSession(this.workspaceRoot);
      this.guidedState = await readGuidedState(this.workspaceRoot);
      this.activeStepId =
        this.guidedState?.activeStepId ?? this.getOrderedSteps()[0]?.id ?? null;
    } catch {
      this.session = null;
      this.guidedState = null;
      this.activeStepId = null;
      this.stopPlayback();
      this.clearDecorations();
      await this.publishState(
        `No guided session is loaded. Expected ${paths.currentRecipePath}.`
      );
      return;
    }

    if (this.activeStepId && this.session) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await this.applyStepDecorations(editor);
      }
    }

    await this.maybeAutoCompleteActiveStep();
    await this.publishState(null);
  }

  private getOrderedSteps(): GuidedStep[] {
    return [...(this.session?.steps ?? [])].sort((left, right) => left.order - right.order);
  }

  private getActiveStep(): GuidedStep | undefined {
    return this.getOrderedSteps().find((step) => step.id === this.activeStepId);
  }

  private async goToAdjacentStep(offset: 1 | -1): Promise<void> {
    const orderedSteps = this.getOrderedSteps();
    if (!orderedSteps.length) {
      return;
    }

    const currentIndex = orderedSteps.findIndex((step) => step.id === this.activeStepId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + offset, 0), orderedSteps.length - 1);

    await this.activateStep(orderedSteps[nextIndex]!.id);
  }

  private async activateStep(stepId: string): Promise<void> {
    if (!this.session) {
      return;
    }

    const step = this.session.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      return;
    }

    this.guidedState = await setActiveStep(this.workspaceRoot, this.session, step.id);
    this.activeStepId = step.id;
    await this.revealStep(step);
    await this.maybeAutoCompleteActiveStep();
    await this.publishState(null);
  }

  private async completeActiveStep(): Promise<void> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation" || !this.session) {
      return;
    }

    this.guidedState = await updateGuidedStepStatus(this.workspaceRoot, this.session, step.id, "complete");
    this.activeStepId = this.guidedState.activeStepId;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyStepDecorations(editor);
    }

    await this.publishState(null);
  }

  private async undoCompleteActiveStep(): Promise<void> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation" || !this.session) {
      return;
    }

    this.guidedState = await undoGuidedStepCompletion(this.workspaceRoot, this.session, step.id);
    this.activeStepId = this.guidedState.activeStepId;
    await this.revealStep(step);
    await this.publishState(null);
  }

  private async setStepCompletion(stepId: string, complete: boolean): Promise<void> {
    if (!this.session) {
      return;
    }

    const step = this.session.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.mode !== "implementation") {
      return;
    }

    if (complete) {
      this.guidedState = await updateGuidedStepStatus(
        this.workspaceRoot,
        this.session,
        step.id,
        "complete"
      );
      this.activeStepId = this.guidedState.activeStepId;
    } else {
      this.guidedState = await reopenGuidedStep(this.workspaceRoot, this.session, step.id);
      this.activeStepId = step.id;
      await this.revealStep(step);
    }

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyStepDecorations(editor);
    }

    await this.publishState(null);
  }

  private togglePlayback() {
    if (this.session?.mode !== "pr_review") {
      return;
    }

    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.isPlaying = true;
      this.playbackTimer = setInterval(() => {
        void this.advancePlayback();
      }, 2500);
    }

    void this.publishState(null);
  }

  private setGuidanceMode(mode: GuidanceMode) {
    if (this.guidanceMode === mode) {
      return;
    }

    this.guidanceMode = mode;
    this.syncTabAcceptContext();
    void this.refreshVisibleGuidance();
    void this.publishState(null);
  }

  private toggleTabAccept() {
    this.tabAcceptEnabled = !this.tabAcceptEnabled;
    this.syncTabAcceptContext();
    void this.publishState(null);
  }

  private stopPlayback() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  private syncTabAcceptContext() {
    void vscode.commands.executeCommand(
      "setContext",
      "duckWalk.disableTabAccept",
      this.guidanceMode === "suggest" && !this.tabAcceptEnabled
    );
  }

  private async refreshVisibleGuidance(): Promise<void> {
    await vscode.commands.executeCommand("hideSuggestWidget");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    this.queueGuidanceRefresh(editor);
  }

  private async advancePlayback() {
    const orderedSteps = this.getOrderedSteps();
    const currentIndex = orderedSteps.findIndex((step) => step.id === this.activeStepId);

    if (currentIndex === -1) {
      if (orderedSteps[0]) {
        await this.activateStep(orderedSteps[0].id);
      }
      return;
    }

    const nextStep = orderedSteps[currentIndex + 1];
    if (!nextStep) {
      this.stopPlayback();
      await this.publishState(null);
      return;
    }

    await this.activateStep(nextStep.id);
  }

  private async revealStep(step: GuidedStep): Promise<void> {
    const filePath = path.join(this.workspaceRoot, step.file.path);

    if (step.file.createIfMissing) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, "", { flag: "a" });
    }

    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false
      });
      const range = this.resolveRange(document, step);
      if (step.mode === "implementation") {
        const insertionPosition = this.resolveImplementationInsertionPosition(document, step);
        editor.selection = new vscode.Selection(insertionPosition, insertionPosition);
      } else {
        editor.selection = new vscode.Selection(range.start, range.end);
      }
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      await this.narrator.speak(step);
      await this.applyStepDecorations(editor);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to open target file ${step.file.path}`;
      await this.publishState(message);
    }
  }

  private resolveRange(document: vscode.TextDocument, step: GuidedStep): vscode.Range {
    if (step.mode === "pr_review" && step.review.changedRange) {
      return this.rangeFromGuidedRange(document, step.review.changedRange);
    }

    if (step.location.strategy === "range" && step.location.range) {
      return this.rangeFromGuidedRange(document, step.location.range);
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

  private rangeFromGuidedRange(document: vscode.TextDocument, range: GuidedRange): vscode.Range {
    const startLine = Math.min(range.startLine - 1, Math.max(document.lineCount - 1, 0));
    const endLine = Math.min(range.endLine - 1, Math.max(document.lineCount - 1, 0));
    const start = new vscode.Position(startLine, range.startCharacter);
    const end = new vscode.Position(endLine, range.endCharacter);
    return new vscode.Range(start, end);
  }

  private resolveImplementationInsertionPosition(
    document: vscode.TextDocument,
    step: GuidedStep
  ): vscode.Position {
    if (step.location.strategy === "range" && step.location.range) {
      return this.rangeFromGuidedRange(document, step.location.range).start;
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

  private clearDecorations() {
    this.lastDecoratedEditor?.setDecorations(this.highlightDecorationType, []);
    this.lastDecoratedEditor?.setDecorations(this.ghostTextDecorationType, []);
    this.lastDecoratedEditor = null;
  }

  private async applyStepDecorations(editor: vscode.TextEditor): Promise<void> {
    const step = this.getActiveStep();
    this.clearDecorations();

    if (!step || editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      if (this.guidanceMode === "suggest") {
        void vscode.commands.executeCommand("hideSuggestWidget");
      }
      return;
    }

    const range = this.resolveRange(editor.document, step);
    editor.setDecorations(this.highlightDecorationType, [range]);

    if (step.mode === "implementation") {
      this.queueGuidanceRefresh(editor);
    } else if (this.guidanceMode === "suggest") {
      void vscode.commands.executeCommand("hideSuggestWidget");
    }

    this.lastDecoratedEditor = editor;
  }

  private queueGuidanceRefresh(editor: vscode.TextEditor) {
    switch (this.guidanceMode) {
      case "diff":
        this.queueDiffRefresh(editor);
        break;
      case "inline":
        this.applyInlineGhostText(editor);
        break;
      case "suggest":
        this.queueSuggestWidgetRefresh(editor);
        break;
      case "hover":
        this.queueHoverRefresh(editor);
        break;
      case "peek":
        this.queuePeekRefresh(editor);
        break;
    }
  }

  private applyInlineGhostText(editor: vscode.TextEditor) {
    const decoration = this.getActiveImplementationGhostDecoration(editor);
    editor.setDecorations(this.ghostTextDecorationType, decoration ? [decoration] : []);
  }

  private getRemainingGhostCode(
    editor: vscode.TextEditor,
    position: vscode.Position,
    ghostCode: string
  ): string | null {
    const document = editor.document;
    const anchorOffset = document.offsetAt(position);
    const documentTextFromAnchor = document.getText().slice(anchorOffset).replace(/\r\n/g, "\n");
    const cursorOffset = Math.max(anchorOffset, document.offsetAt(editor.selection.active));
    const typedPrefix = document.getText().slice(anchorOffset, cursorOffset).replace(/\r\n/g, "\n");
    const normalisedGhostCode = this.getAdaptedGhostCode(editor, ghostCode)
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "");

    if (normaliseCode(documentTextFromAnchor).includes(normaliseCode(normalisedGhostCode))) {
      return null;
    }

    const { expectedIndex } = this.matchGhostCodePrefix(typedPrefix, normalisedGhostCode);

    const remainingGhostCode = normalisedGhostCode.slice(expectedIndex);
    return remainingGhostCode || null;
  }

  private matchGhostCodePrefix(actualText: string, ghostCode: string) {
    return matchGhostCodePrefix(actualText, ghostCode);
  }

  getActiveImplementationCompletion(
    editor: vscode.TextEditor,
    position?: vscode.Position
  ): vscode.CompletionItem | null {
    if (this.guidanceMode !== "suggest") {
      return null;
    }

    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }

    if (editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return null;
    }

    if (this.guidedState?.steps[step.id]?.status === "complete") {
      return null;
    }

    const insertionPosition = this.resolveImplementationInsertionPosition(editor.document, step);
    const activePosition = position ?? editor.selection.active;

    if (editor.selection.anchor.line !== activePosition.line || editor.selection.anchor.character !== activePosition.character) {
      return null;
    }

    if (editor.document.offsetAt(activePosition) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const remainingGhostCode = this.getRemainingGhostCode(editor, insertionPosition, step.ghostCode);
    if (!remainingGhostCode) {
      return null;
    }

    const previewLine =
      remainingGhostCode.split("\n").find((line) => line.trim().length > 0) ?? remainingGhostCode;
    const typedPrefix = editor.document
      .getText()
      .slice(editor.document.offsetAt(insertionPosition), editor.document.offsetAt(activePosition))
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
    item.documentation = new vscode.MarkdownString("Suggested remainder for the active guided step.");

    return item;
  }

  getActiveImplementationHover(
    editor: vscode.TextEditor,
    position: vscode.Position
  ): vscode.Hover | null {
    if (this.guidanceMode !== "hover") {
      return null;
    }

    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }

    if (editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return null;
    }

    if (this.guidedState?.steps[step.id]?.status === "complete") {
      return null;
    }

    const insertionPosition = this.resolveImplementationInsertionPosition(editor.document, step);
    if (editor.document.offsetAt(position) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const adaptedGhostCode = this.getAdaptedGhostCode(editor, step.ghostCode);
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(`**duckWalk**\n\n${step.explanation.title}\n\n`);
    markdown.appendCodeblock(adaptedGhostCode, editor.document.languageId);
    markdown.isTrusted = false;

    return new vscode.Hover(markdown, new vscode.Range(position, position));
  }

  private getActiveImplementationGhostDecoration(
    editor: vscode.TextEditor
  ): vscode.DecorationOptions | null {
    if (this.guidanceMode !== "inline") {
      return null;
    }

    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return null;
    }

    if (editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return null;
    }

    if (this.guidedState?.steps[step.id]?.status === "complete") {
      return null;
    }

    if (editor.selections.length !== 1 || !editor.selection.isEmpty) {
      return null;
    }

    const insertionPosition = this.resolveImplementationInsertionPosition(editor.document, step);
    const activePosition = editor.selection.active;

    if (editor.document.offsetAt(activePosition) < editor.document.offsetAt(insertionPosition)) {
      return null;
    }

    const remainingGhostCode = this.getRemainingGhostCode(editor, insertionPosition, step.ghostCode);
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
      renderOptions = {
        after: {
          contentText: firstLine
        }
      };
    } else if (!line.isEmptyOrWhitespace && line.text.length > 0) {
      const rangeEnd = activePosition.translate(0, 1);
      anchorRange = new vscode.Range(activePosition, rangeEnd);
      renderOptions = {
        before: {
          contentText: firstLine
        }
      };
    } else {
      anchorRange = new vscode.Range(activePosition, activePosition);
      renderOptions = {
        after: {
          contentText: firstLine
        }
      };
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

  private queueSuggestWidgetRefresh(editor: vscode.TextEditor) {
    if (this.suggestRefreshTimer) {
      clearTimeout(this.suggestRefreshTimer);
    }

    this.suggestRefreshTimer = setTimeout(() => {
      this.suggestRefreshTimer = null;

      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      const completion = this.getActiveImplementationCompletion(editor);
      void vscode.commands.executeCommand(
        completion ? "editor.action.triggerSuggest" : "hideSuggestWidget"
      );
    }, 0);
  }

  private queueHoverRefresh(editor: vscode.TextEditor) {
    if (this.hoverRefreshTimer) {
      clearTimeout(this.hoverRefreshTimer);
    }

    this.hoverRefreshTimer = setTimeout(() => {
      this.hoverRefreshTimer = null;

      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      const hover = this.getActiveImplementationHover(editor, editor.selection.active);
      if (hover) {
        void vscode.commands.executeCommand("editor.action.showHover");
      }
    }, 0);
  }

  private queuePeekRefresh(editor: vscode.TextEditor) {
    if (this.peekRefreshTimer) {
      clearTimeout(this.peekRefreshTimer);
    }

    this.peekRefreshTimer = setTimeout(() => {
      this.peekRefreshTimer = null;

      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      void this.showPeekPreview(editor);
    }, 0);
  }

  private queueDiffRefresh(editor: vscode.TextEditor) {
    if (this.diffRefreshTimer) {
      clearTimeout(this.diffRefreshTimer);
    }

    this.diffRefreshTimer = setTimeout(() => {
      this.diffRefreshTimer = null;

      if (editor !== vscode.window.activeTextEditor) {
        return;
      }

      void this.showDiffPreview(editor);
    }, 0);
  }

  private async showPeekPreview(editor: vscode.TextEditor): Promise<void> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return;
    }

    if (editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return;
    }

    if (this.guidedState?.steps[step.id]?.status === "complete") {
      return;
    }

    const previewUri = this.getPreviewUri(step, "peek");

    this.previewProvider.update(previewUri, this.getAdaptedGhostCode(editor, step.ghostCode));

    const document = await vscode.workspace.openTextDocument(previewUri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true
    });
  }

  private async showDiffPreview(editor: vscode.TextEditor): Promise<void> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation") {
      return;
    }

    if (editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return;
    }

    const diffPreview = this.buildGuidedDiffPreview(editor, step);
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

  private buildGuidedDiffPreview(
    editor: vscode.TextEditor,
    step: ImplementationStep
  ): { content: string; highlightRanges: vscode.Range[] } | null {
    const document = editor.document;
    const insertionPosition = this.resolveImplementationInsertionPosition(document, step);
    const anchorOffset = document.offsetAt(insertionPosition);
    const cursorOffset = Math.max(anchorOffset, document.offsetAt(editor.selection.active));
    const originalText = document.getText();
    const preview = buildGuidancePreviewFromAnchor({
      actualPrefix: originalText.slice(anchorOffset, cursorOffset),
      actualSuffix: originalText.slice(cursorOffset),
      ghostCode: this.getAdaptedGhostCode(editor, step.ghostCode)
    });

    if (!preview) {
      return {
        content: originalText,
        highlightRanges: []
      };
    }

    const previewDocumentText = `${originalText.slice(0, anchorOffset)}${preview.mergedText}`;
    const highlightRange = this.rangeFromOffsets(
      previewDocumentText,
      anchorOffset + preview.insertedStart,
      anchorOffset + preview.insertedEnd
    );

    return {
      content: previewDocumentText,
      highlightRanges: highlightRange ? [highlightRange] : []
    };
  }

  private rangeFromOffsets(
    text: string,
    startOffset: number,
    endOffset: number
  ): vscode.Range | null {
    if (endOffset <= startOffset) {
      return null;
    }

    const start = this.positionFromOffset(text, startOffset);
    const end = this.positionFromOffset(text, endOffset);
    return new vscode.Range(start, end);
  }

  private positionFromOffset(text: string, offset: number): vscode.Position {
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    const prefix = text.slice(0, safeOffset);
    const lines = prefix.split("\n");
    const line = Math.max(lines.length - 1, 0);
    const character = lines.at(-1)?.length ?? 0;
    return new vscode.Position(line, character);
  }

  private applyDiffPreviewDecorations(editor: vscode.TextEditor) {
    if (editor.document.uri.scheme !== "duckwalk-preview") {
      return;
    }

    editor.setDecorations(
      this.diffPreviewDecorationType,
      this.previewProvider.getHighlightRanges(editor.document.uri)
    );
  }

  private getEditorIndentationPreference(editor: vscode.TextEditor): IndentationPreference {
    const insertSpacesOption = editor.options.insertSpaces;
    const tabSizeOption = editor.options.tabSize;
    const insertSpaces = insertSpacesOption === "auto" ? this.inferInsertSpaces(editor.document) : insertSpacesOption !== false;
    const tabSize =
      typeof tabSizeOption === "number"
        ? tabSizeOption
        : this.inferTabSize(editor.document, insertSpaces);

    return {
      insertSpaces,
      tabSize: Math.max(tabSize, 1)
    };
  }

  private inferInsertSpaces(document: vscode.TextDocument): boolean {
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

  private inferTabSize(document: vscode.TextDocument, insertSpaces: boolean): number {
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

  private getAdaptedGhostCode(editor: vscode.TextEditor, ghostCode: string): string {
    return adaptCodeIndentation(ghostCode, this.getEditorIndentationPreference(editor));
  }

  private validateStepAgainstEditorDocument(
    step: ImplementationStep,
    document: vscode.TextDocument
  ): boolean {
    const editor =
      vscode.window.visibleTextEditors.find((candidate) => candidate.document === document) ??
      (vscode.window.activeTextEditor?.document === document ? vscode.window.activeTextEditor : null);

    if (!editor) {
      return validateStepAgainstContent(step, document.getText());
    }

    const expectedText = adaptCodeIndentation(
      getValidationText(step),
      this.getEditorIndentationPreference(editor)
    );
    const validationWindow = extractValidationWindow(document.getText(), step.location, step.validation);
    return validateExpectedCode(validationWindow, expectedText);
  }

  private clearPendingAutoComplete() {
    if (this.autoCompleteTimer) {
      clearTimeout(this.autoCompleteTimer);
      this.autoCompleteTimer = null;
    }
  }

  private scheduleAutoCompleteActiveStep(document: vscode.TextDocument, delayMs = 180) {
    this.clearPendingAutoComplete();

    this.autoCompleteTimer = setTimeout(() => {
      this.autoCompleteTimer = null;
      void this.completeAfterSettledChange(document);
    }, delayMs);
  }

  private async completeAfterSettledChange(document: vscode.TextDocument) {
    const didComplete = await this.maybeAutoCompleteActiveStep(document);
    if (!didComplete) {
      return;
    }

    await this.publishState(null);
  }

  private async maybeAutoCompleteActiveStep(document?: vscode.TextDocument): Promise<boolean> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation" || !this.session) {
      return false;
    }

    if (this.guidedState?.steps[step.id]?.status === "complete") {
      return false;
    }

    const expectedPath = path.join(this.workspaceRoot, step.file.path);
    let targetDocument = document;

    if (!targetDocument || targetDocument.uri.fsPath !== expectedPath) {
      try {
        targetDocument = await vscode.workspace.openTextDocument(expectedPath);
      } catch {
        return false;
      }
    }

    if (!this.validateStepAgainstEditorDocument(step, targetDocument)) {
      return false;
    }

    this.guidedState = await updateGuidedStepStatus(
      this.workspaceRoot,
      this.session,
      step.id,
      "complete"
    );
    this.activeStepId = this.guidedState.activeStepId;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyStepDecorations(editor);
    }

    return true;
  }

  private async handleDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const step = this.getActiveStep();
    if (!step || step.mode !== "implementation" || !this.session) {
      return;
    }

    const expectedPath = path.join(this.workspaceRoot, step.file.path);
    if (event.document.uri.fsPath !== expectedPath) {
      return;
    }

    const isComplete = this.validateStepAgainstEditorDocument(step, event.document);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyStepDecorations(editor);
    }
    if (!isComplete) {
      this.clearPendingAutoComplete();
      return;
    }

    this.scheduleAutoCompleteActiveStep(event.document);
  }

  private async publishState(error: string | null): Promise<void> {
    const payload: WebviewState = {
      session: this.session,
      guidedState: this.guidedState,
      activeStepId: this.activeStepId,
      isPlaying: this.isPlaying,
      guidanceMode: this.guidanceMode,
      tabAcceptEnabled: this.tabAcceptEnabled,
      error
    };

    await this.viewProvider?.update(payload);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const previewProvider = new DuckWalkPreviewProvider();
  const controller = new DuckWalkController(
    workspaceFolder.uri.fsPath,
    workspaceFolder.uri,
    previewProvider
  );
  const provider = new DuckWalkViewProvider(context.extensionUri, controller);
  controller.setViewProvider(provider);

  context.subscriptions.push(
    previewProvider,
    vscode.commands.registerCommand("duckWalk.dismissSuggestionWidget", async () => {
      await vscode.commands.executeCommand("hideSuggestWidget");
    }),
    vscode.workspace.registerTextDocumentContentProvider("duckwalk-preview", previewProvider),
    vscode.languages.registerHoverProvider({ scheme: "file" }, {
      provideHover(document, position) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
          return undefined;
        }

        return controller.getActiveImplementationHover(editor, position) ?? undefined;
      }
    }),
    vscode.languages.registerCompletionItemProvider({ scheme: "file" }, {
      provideCompletionItems(document, position) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
          return undefined;
        }

        const completion = controller.getActiveImplementationCompletion(editor, position);
        return completion ? [completion] : undefined;
      }
    }),
    vscode.window.registerWebviewViewProvider("duckWalk.sidebar", provider),
    vscode.commands.registerCommand("duckWalk.startSession", () => controller.startSession()),
    vscode.commands.registerCommand("duckWalk.nextStep", () => controller.handleSidebarMessage({ type: "next-step" })),
    vscode.commands.registerCommand("duckWalk.previousStep", () =>
      controller.handleSidebarMessage({ type: "previous-step" })
    ),
    vscode.commands.registerCommand("duckWalk.completeStep", () =>
      controller.handleSidebarMessage({ type: "complete-step" })
    ),
    vscode.commands.registerCommand("duckWalk.undoCompleteStep", () =>
      controller.handleSidebarMessage({ type: "undo-complete-step" })
    ),
    vscode.commands.registerCommand("duckWalk.refreshSession", () =>
      controller.handleSidebarMessage({ type: "refresh-session" })
    ),
    vscode.commands.registerCommand("duckWalk.togglePlayback", () =>
      controller.handleSidebarMessage({ type: "toggle-playback" })
    )
  );

  await controller.initialize(context);
}

export function deactivate(): void {}
