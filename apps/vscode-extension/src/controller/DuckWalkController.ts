import { listGuidedSessions, switchGuidedSession, resolveGuidedPaths, type GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession, GuidedStep } from "@duckwalk/schema";
import * as vscode from "vscode";

import { DuckWalkPreviewProvider } from "../DuckWalkPreviewProvider";
import { DuckWalkViewProvider } from "../sidebar/DuckWalkViewProvider";
import type { GuidanceMode, SidebarController, SidebarMessage, WalkthroughDriftState } from "../sidebar/types";
import { NoopStepNarrator } from "../speech/narrator";
import { ImplementationAutoComplete } from "./ImplementationAutoComplete";
import { ImplementationPresentation } from "./ImplementationPresentation";
import { applyStepDecorations, clearStepDecorations, openWorkspaceFile, revealStepInEditor, type StepDecorationState } from "./editorNavigation";
import { getActiveStep, getOrderedSteps } from "./stepState";
import { createControllerDisposables, disposeControllerRuntime } from "./runtimeLifecycle";
import { activateStepAction, advancePlaybackAction, selectEvidenceAction, updateCompletionAction } from "./userActions";
import { createAutoCompleteContext, createMutators, createPresentationContext, createStateSnapshot, createWebviewState } from "./controllerContext";
import { dispatchSidebarMessage, getAdjacentStepId, reloadSessionAction } from "./controllerOperations";
export class DuckWalkController implements SidebarController, vscode.Disposable {
  private readonly narrator = new NoopStepNarrator();
  private readonly highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
    border: "1px solid rgba(128, 128, 128, 0.35)"
  });
  private readonly activeEvidenceDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid rgba(255, 200, 90, 0.75)"
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
  private readonly presentation: ImplementationPresentation;
  private readonly autoComplete = new ImplementationAutoComplete();
  private session: GuidedSession | null = null;
  private guidedState: GuidedSessionState | null = null;
  private activeStepId: string | null = null;
  private activeEvidenceId: string | null = null;
  private walkthroughDrift: WalkthroughDriftState | null = null;
  private isPlaying = false;
  private guidanceMode: GuidanceMode = "diff";
  private tabAcceptEnabled = false;
  private playbackTimer: NodeJS.Timeout | null = null;
  private viewProvider: DuckWalkViewProvider | null = null;
  private decorationState: StepDecorationState = { lastDecoratedEditor: null };

  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceUri: vscode.Uri,
    private readonly previewProvider: DuckWalkPreviewProvider
  ) {
    this.presentation = new ImplementationPresentation(
      workspaceRoot,
      previewProvider,
      this.ghostTextDecorationType,
      this.diffPreviewDecorationType
    );
  }
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.disposables.push(
      ...createControllerDisposables({
        context,
        workspaceUri: this.workspaceUri,
        onDidChangeTextDocument: (event) => {
          void this.autoComplete.handleDocumentChange(event, this.createAutoCompleteContext());
        },
        onDidChangeSelection: (editor) => {
          void this.applyDecorations(editor);
        },
        onDidChangeActiveEditor: (editor) => {
          this.presentation.applyDiffPreviewDecorations(editor);
          void this.applyDecorations(editor);
        },
        onRecipeChange: () => {
          void this.reloadSession();
        }
      })
    );
    context.subscriptions.push(this);
    this.syncTabAcceptContext();
    await this.reloadSession();
  }
  setViewProvider(provider: DuckWalkViewProvider) { this.viewProvider = provider; }
  dispose(): void {
    this.decorationState = disposeControllerRuntime({
      disposables: this.disposables,
      stopPlayback: () => this.stopPlayback(),
      decorationState: this.decorationState,
      decorationTypes: this.decorationTypes(),
      presentationDispose: () => this.presentation.dispose(),
      autoCompleteDispose: () => this.autoComplete.dispose(),
      highlightDecorationType: this.highlightDecorationType,
      activeEvidenceDecorationType: this.activeEvidenceDecorationType,
      ghostTextDecorationType: this.ghostTextDecorationType,
      diffPreviewDecorationType: this.diffPreviewDecorationType
    });
  }
  async handleSidebarMessage(message: SidebarMessage): Promise<void> {
    await dispatchSidebarMessage({
      message,
      startSession: () => this.startSession(),
      goToAdjacentStep: (offset) => this.goToAdjacentStep(offset),
      togglePlayback: () => this.togglePlayback(),
      setGuidanceMode: (mode) => this.setGuidanceMode(mode),
      toggleTabAccept: () => this.toggleTabAccept(),
      reloadSession: () => this.reloadSession(),
      switchSession: async (sessionId) => { await switchGuidedSession(this.workspaceRoot, sessionId); await this.reloadSession(); },
      completeActiveStep: () => this.completeActiveStep(),
      undoCompleteActiveStep: () => this.undoCompleteActiveStep(),
      setStepCompletion: (stepId, complete) => this.setStepCompletion(stepId, complete),
      selectEvidence: (stepId, evidenceId) => this.selectEvidence(stepId, evidenceId),
      activateStep: (stepId, evidenceId) => this.activateStep(stepId, evidenceId),
      openFile: (filePath) => this.openFile(filePath)
    });
  }
  async startSession(): Promise<void> {
    if (!this.session) {
      await this.reloadSession();
    }
    const step = getOrderedSteps(this.session)[0];
    if (step) {
      await this.activateStep(step.id);
    }
  }
  async reloadSession(): Promise<void> {
    const paths = resolveGuidedPaths(this.workspaceRoot);
    await reloadSessionAction({
      workspaceRoot: this.workspaceRoot,
      onLoaded: (snapshot) => {
        this.session = snapshot.session;
        this.guidedState = snapshot.guidedState;
        this.activeStepId = snapshot.activeStepId;
        this.activeEvidenceId = snapshot.activeEvidenceId;
        this.walkthroughDrift = snapshot.walkthroughDrift;
      },
      onMissing: async () => {
        this.session = null;
        this.guidedState = null;
        this.activeStepId = null;
        this.activeEvidenceId = null;
        this.walkthroughDrift = null;
        this.stopPlayback();
        this.decorationState = clearStepDecorations(this.decorationState, this.decorationTypes());
        await this.publishState(`No guided session is loaded. Expected ${paths.currentRecipePath}.`);
      },
      applyDecorations: (editor) => this.activeStepId ? this.applyDecorations(editor) : Promise.resolve(),
      maybeAutoComplete: async () => {
        await this.autoComplete.maybeAutoCompleteActiveStep(undefined, this.createAutoCompleteContext());
      },
      publishState: () => this.publishState(null)
    });
  }
  getActiveImplementationCompletion(
    editor: vscode.TextEditor,
    position?: vscode.Position
  ): vscode.CompletionItem | null {
    return this.presentation.getActiveImplementationCompletion(
      editor,
      position,
      this.createPresentationContext()
    );
  }
  getActiveImplementationHover(
    editor: vscode.TextEditor,
    position: vscode.Position
  ): vscode.Hover | null {
    return this.presentation.getActiveImplementationHover(
      editor,
      position,
      this.createPresentationContext()
    );
  }
  private getActiveStep(): GuidedStep | undefined { return getActiveStep(this.session, this.activeStepId); }
  private async goToAdjacentStep(offset: 1 | -1): Promise<void> {
    const nextStepId = getAdjacentStepId(this.session, this.activeStepId, offset);
    if (nextStepId) {
      await this.activateStep(nextStepId);
    }
  }
  private async activateStep(stepId: string, evidenceId?: string | null): Promise<void> {
    await activateStepAction({
      workspaceRoot: this.workspaceRoot,
      state: this.stateSnapshot(),
      stepId,
      evidenceId,
      mutators: this.mutators(),
      revealStep: (step, nextEvidenceId) => this.revealStep(step, nextEvidenceId),
      maybeAutoComplete: async () => {
        await this.autoComplete.maybeAutoCompleteActiveStep(undefined, this.createAutoCompleteContext());
      },
      publishState: () => this.publishState(null)
    });
  }
  private async revealStep(step: GuidedStep, evidenceId: string | null): Promise<void> {
    try {
      await revealStepInEditor({
        workspaceRoot: this.workspaceRoot,
        step,
        evidenceId,
        speak: (currentStep) => this.narrator.speak(currentStep),
        applyDecorations: (editor) => this.applyDecorations(editor)
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to open target file ${step.file.path}`;
      await this.publishState(message);
    }
  }
  private async openFile(filePath: string): Promise<void> {
    try {
      await openWorkspaceFile(this.workspaceRoot, filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to open ${filePath}`;
      await this.publishState(message);
    }
  }
  private async selectEvidence(stepId: string, evidenceId: string): Promise<void> {
    await selectEvidenceAction({
      state: this.stateSnapshot(),
      stepId,
      evidenceId,
      setActiveStepId: (nextStepId) => {
        this.activeStepId = nextStepId;
      },
      setActiveEvidenceId: (nextEvidenceId) => {
        this.activeEvidenceId = nextEvidenceId;
      },
      revealStep: (step, nextEvidenceId) => this.revealStep(step, nextEvidenceId),
      publishState: () => this.publishState(null)
    });
  }
  private async completeActiveStep(): Promise<void> {
    await updateCompletionAction({
      workspaceRoot: this.workspaceRoot,
      state: this.stateSnapshot(),
      getActiveStep: () => this.getActiveStep(),
      mutators: this.mutators(),
      revealStep: (step, evidenceId) => this.revealStep(step, evidenceId),
      applyDecorations: (editor) => this.applyDecorations(editor),
      publishState: () => this.publishState(null)
    });
  }
  private async undoCompleteActiveStep(): Promise<void> {
    await updateCompletionAction({
      workspaceRoot: this.workspaceRoot,
      state: this.stateSnapshot(),
      complete: false,
      getActiveStep: () => this.getActiveStep(),
      mutators: this.mutators(),
      revealStep: (step, evidenceId) => this.revealStep(step, evidenceId),
      applyDecorations: (editor) => this.applyDecorations(editor),
      publishState: () => this.publishState(null)
    });
  }
  private async setStepCompletion(stepId: string, complete: boolean): Promise<void> {
    await updateCompletionAction({
      workspaceRoot: this.workspaceRoot,
      state: this.stateSnapshot(),
      stepId,
      complete,
      getActiveStep: () => this.getActiveStep(),
      mutators: this.mutators(),
      revealStep: (step, evidenceId) => this.revealStep(step, evidenceId),
      applyDecorations: (editor) => this.applyDecorations(editor),
      publishState: () => this.publishState(null)
    });
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
  private async advancePlayback() {
    await advancePlaybackAction({
      session: this.session,
      activeStepId: this.activeStepId,
      activateStep: (stepId) => this.activateStep(stepId),
      stopPlayback: () => this.stopPlayback(),
      publishState: () => this.publishState(null)
    });
  }
  private async setGuidanceMode(mode: GuidanceMode) {
    if (this.guidanceMode === mode) {
      return;
    }
    this.guidanceMode = mode;
    this.syncTabAcceptContext();
    await this.presentation.refreshVisibleGuidance(
      vscode.window.activeTextEditor,
      this.createPresentationContext()
    );
    await this.publishState(null);
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
  private async applyDecorations(editor: vscode.TextEditor): Promise<void> {
    this.decorationState = await applyStepDecorations({
      editor,
      step: this.getActiveStep(),
      workspaceRoot: this.workspaceRoot,
      activeEvidenceId: this.activeEvidenceId,
      guidanceMode: this.guidanceMode,
      state: this.decorationState,
      decorationTypes: this.decorationTypes(),
      queueGuidanceRefresh: (currentEditor) =>
        this.presentation.queueGuidanceRefresh(currentEditor, this.createPresentationContext())
    });
  }
  private createPresentationContext() {
    return createPresentationContext({
      workspaceRoot: this.workspaceRoot,
      guidanceMode: this.guidanceMode,
      guidedState: this.guidedState,
      getActiveStep: () => this.getActiveStep()
    });
  }
  private createAutoCompleteContext() {
    return createAutoCompleteContext({
      workspaceRoot: this.workspaceRoot,
      session: this.session,
      guidedState: this.guidedState,
      getActiveStep: () => this.getActiveStep(),
      setGuidedState: (state: GuidedSessionState) => { this.guidedState = state; },
      setActiveStepId: (stepId: string | null) => { this.activeStepId = stepId; },
      applyStepDecorations: (editor: vscode.TextEditor) => this.applyDecorations(editor),
      publishState: (error: string | null) => this.publishState(error)
    });
  }
  private decorationTypes() {
    return {
      highlightDecorationType: this.highlightDecorationType,
      activeEvidenceDecorationType: this.activeEvidenceDecorationType,
      ghostTextDecorationType: this.ghostTextDecorationType
    };
  }
  private mutators() {
    return createMutators({
      setGuidedState: (state: GuidedSessionState) => { this.guidedState = state; },
      setActiveStepId: (stepId: string | null) => { this.activeStepId = stepId; },
      setActiveEvidenceId: (evidenceId: string | null) => { this.activeEvidenceId = evidenceId; }
    });
  }
  private stateSnapshot() {
    return createStateSnapshot({
      session: this.session,
      guidedState: this.guidedState,
      activeStepId: this.activeStepId,
      activeEvidenceId: this.activeEvidenceId
    });
  }
  private async publishState(error: string | null): Promise<void> {
    const sessionHistory = await listGuidedSessions(this.workspaceRoot).catch(() => []);
    const payload = createWebviewState({
      session: this.session,
      guidedState: this.guidedState,
      activeStepId: this.activeStepId,
      activeEvidenceId: this.activeEvidenceId,
      walkthroughDrift: this.walkthroughDrift,
      sessionHistory,
      isPlaying: this.isPlaying,
      guidanceMode: this.guidanceMode,
      tabAcceptEnabled: this.tabAcceptEnabled,
      error
    });
    await this.viewProvider?.update(payload);
  }
}
