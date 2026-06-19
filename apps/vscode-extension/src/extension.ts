import * as vscode from "vscode";

import { DuckWalkPreviewProvider } from "./DuckWalkPreviewProvider";
import { DuckWalkController } from "./controller/DuckWalkController";
import { DuckWalkViewProvider } from "./sidebar/DuckWalkViewProvider";

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
    vscode.commands.registerCommand("duckWalk.nextStep", () =>
      controller.handleSidebarMessage({ type: "next-step" })
    ),
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
