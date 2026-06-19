import * as vscode from "vscode";

import { clearStepDecorations, type StepDecorationState } from "./editorNavigation";

export function createControllerDisposables(params: {
  context: vscode.ExtensionContext;
  workspaceUri: vscode.Uri;
  onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void;
  onDidChangeSelection: (editor: vscode.TextEditor) => void;
  onDidChangeActiveEditor: (editor: vscode.TextEditor) => void;
  onRecipeChange: () => void;
}): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [
    vscode.workspace.onDidChangeTextDocument(params.onDidChangeTextDocument),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        params.onDidChangeSelection(event.textEditor);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        params.onDidChangeActiveEditor(editor);
      }
    })
  ];

  const recipeWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(params.workspaceUri, ".guided-implementation/*.json")
  );
  disposables.push(
    recipeWatcher,
    recipeWatcher.onDidCreate(params.onRecipeChange),
    recipeWatcher.onDidChange(params.onRecipeChange),
    recipeWatcher.onDidDelete(params.onRecipeChange)
  );

  params.context.subscriptions.push(...disposables);
  return disposables;
}

export function disposeControllerRuntime(params: {
  disposables: vscode.Disposable[];
  stopPlayback: () => void;
  decorationState: StepDecorationState;
  decorationTypes: {
    highlightDecorationType: vscode.TextEditorDecorationType;
    activeEvidenceDecorationType: vscode.TextEditorDecorationType;
    ghostTextDecorationType: vscode.TextEditorDecorationType;
  };
  presentationDispose: () => void;
  autoCompleteDispose: () => void;
  highlightDecorationType: vscode.TextEditorDecorationType;
  activeEvidenceDecorationType: vscode.TextEditorDecorationType;
  ghostTextDecorationType: vscode.TextEditorDecorationType;
  diffPreviewDecorationType: vscode.TextEditorDecorationType;
}): StepDecorationState {
  params.stopPlayback();
  params.presentationDispose();
  params.autoCompleteDispose();
  const clearedState = clearStepDecorations(params.decorationState, params.decorationTypes);
  params.highlightDecorationType.dispose();
  params.activeEvidenceDecorationType.dispose();
  params.ghostTextDecorationType.dispose();
  params.diffPreviewDecorationType.dispose();
  params.disposables.forEach((disposable) => disposable.dispose());
  return clearedState;
}
