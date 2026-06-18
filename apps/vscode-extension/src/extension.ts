import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normaliseCode,
  readGuidedState,
  readGuidedSession,
  resolveGuidedPaths,
  setActiveStep,
  updateGuidedStepStatus,
  validateStepAgainstContent
} from "@guidedpatch/core";
import type { GuidedSessionState } from "@guidedpatch/core";
import type { GuidedRange, GuidedSession, GuidedStep } from "@guidedpatch/schema";
import * as vscode from "vscode";

import { GuidedPatchViewProvider } from "./sidebar/GuidedPatchViewProvider";
import type { SidebarController, SidebarMessage, WebviewState } from "./sidebar/types";
import { NoopStepNarrator } from "./speech/narrator";

class GuidedPatchController implements SidebarController, vscode.Disposable {
  private readonly narrator = new NoopStepNarrator();
  private readonly ghostDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor("editorGhostText.foreground"),
      fontStyle: "italic",
      textDecoration: "none; white-space: pre;"
    }
  });
  private readonly highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
    border: "1px solid rgba(128, 128, 128, 0.35)"
  });
  private readonly disposables: vscode.Disposable[] = [];
  private session: GuidedSession | null = null;
  private guidedState: GuidedSessionState | null = null;
  private activeStepId: string | null = null;
  private isPlaying = false;
  private playbackTimer: NodeJS.Timeout | null = null;
  private viewProvider: GuidedPatchViewProvider | null = null;
  private lastDecoratedEditor: vscode.TextEditor | null = null;

  constructor(private readonly workspaceRoot: string, private readonly workspaceUri: vscode.Uri) {}

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
    await this.reloadSession();
  }

  setViewProvider(provider: GuidedPatchViewProvider) {
    this.viewProvider = provider;
  }

  dispose(): void {
    this.stopPlayback();
    this.clearDecorations();
    this.ghostDecorationType.dispose();
    this.highlightDecorationType.dispose();
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
      case "refresh-session":
        await this.reloadSession();
        break;
      case "complete-step":
        await this.completeActiveStep();
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

  private stopPlayback() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
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
    this.lastDecoratedEditor?.setDecorations(this.ghostDecorationType, []);
    this.lastDecoratedEditor?.setDecorations(this.highlightDecorationType, []);
    this.lastDecoratedEditor = null;
  }

  private async applyStepDecorations(editor: vscode.TextEditor): Promise<void> {
    const step = this.getActiveStep();
    this.clearDecorations();

    if (!step || editor.document.uri.fsPath !== path.join(this.workspaceRoot, step.file.path)) {
      return;
    }

    const range = this.resolveRange(editor.document, step);
    editor.setDecorations(this.highlightDecorationType, [range]);

    if (step.mode === "implementation") {
      const isComplete = this.guidedState?.steps[step.id]?.status === "complete";
      if (!isComplete) {
        const insertionPosition = this.resolveImplementationInsertionPosition(editor.document, step);
        editor.setDecorations(
          this.ghostDecorationType,
          this.createGhostDecorationOptions(editor, insertionPosition, step.ghostCode)
        );
      }
    }

    this.lastDecoratedEditor = editor;
  }

  private createGhostDecorationOptions(
    editor: vscode.TextEditor,
    position: vscode.Position,
    ghostCode: string
  ): vscode.DecorationOptions[] {
    const document = editor.document;
    const anchorOffset = document.offsetAt(position);
    const documentTextFromAnchor = document.getText().slice(anchorOffset).replace(/\r\n/g, "\n");
    const cursorOffset = Math.max(anchorOffset, document.offsetAt(editor.selection.active));
    const typedPrefix = document.getText().slice(anchorOffset, cursorOffset).replace(/\r\n/g, "\n");
    const normalisedGhostCode = ghostCode.replace(/\r\n/g, "\n").replace(/\n$/, "");

    if (normaliseCode(documentTextFromAnchor).includes(normaliseCode(normalisedGhostCode))) {
      return [];
    }

    let expectedIndex = 0;
    let actualIndex = 0;

    while (actualIndex < typedPrefix.length && expectedIndex < normalisedGhostCode.length) {
      if (typedPrefix[actualIndex] === normalisedGhostCode[expectedIndex]) {
        actualIndex += 1;
        expectedIndex += 1;
        continue;
      }

      if (/\s/.test(normalisedGhostCode[expectedIndex] ?? "") && !/\s/.test(typedPrefix[actualIndex] ?? "")) {
        expectedIndex += 1;
        continue;
      }

      break;
    }

    const remainingGhostCode = normalisedGhostCode.slice(expectedIndex);
    if (!remainingGhostCode) {
      return [];
    }

    const anchor = document.positionAt(cursorOffset);

    return [
      {
        range: new vscode.Range(anchor, anchor),
        renderOptions: {
          after: {
            contentText: remainingGhostCode
          }
        }
      }
    ];
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

    const isComplete = validateStepAgainstContent(step, event.document.getText());
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyStepDecorations(editor);
    }
    if (!isComplete) {
      return;
    }

    this.guidedState = await updateGuidedStepStatus(this.workspaceRoot, this.session, step.id, "complete");
    this.activeStepId = this.guidedState.activeStepId;
    const refreshedEditor = vscode.window.activeTextEditor;
    if (refreshedEditor) {
      await this.applyStepDecorations(refreshedEditor);
    }
    await this.publishState(null);
  }

  private async publishState(error: string | null): Promise<void> {
    const payload: WebviewState = {
      session: this.session,
      guidedState: this.guidedState,
      activeStepId: this.activeStepId,
      isPlaying: this.isPlaying,
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

  const controller = new GuidedPatchController(workspaceFolder.uri.fsPath, workspaceFolder.uri);
  const provider = new GuidedPatchViewProvider(context.extensionUri, controller);
  controller.setViewProvider(provider);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("guidedPatch.sidebar", provider),
      vscode.commands.registerCommand("guidedPatch.startSession", () => controller.startSession()),
      vscode.commands.registerCommand("guidedPatch.nextStep", () => controller.handleSidebarMessage({ type: "next-step" })),
      vscode.commands.registerCommand("guidedPatch.previousStep", () =>
        controller.handleSidebarMessage({ type: "previous-step" })
      ),
      vscode.commands.registerCommand("guidedPatch.completeStep", () =>
        controller.handleSidebarMessage({ type: "complete-step" })
      ),
      vscode.commands.registerCommand("guidedPatch.refreshSession", () =>
        controller.handleSidebarMessage({ type: "refresh-session" })
      ),
    vscode.commands.registerCommand("guidedPatch.togglePlayback", () =>
      controller.handleSidebarMessage({ type: "toggle-playback" })
    )
  );

  await controller.initialize(context);
}

export function deactivate(): void {}
