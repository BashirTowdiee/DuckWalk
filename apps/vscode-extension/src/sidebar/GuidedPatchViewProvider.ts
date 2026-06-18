import * as vscode from "vscode";

import type { SidebarController, WebviewState } from "./types";

export class GuidedPatchViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: SidebarController
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")]
    };
    view.webview.html = this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((message) => this.controller.handleSidebarMessage(message));
  }

  async update(state: WebviewState): Promise<void> {
    await this.view?.webview.postMessage({
      type: "state",
      payload: state
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      body {
        margin: 0;
        padding: 0;
        background: var(--vscode-sideBar-background);
        color: var(--vscode-foreground);
      }
      button {
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
      }
      button.secondary {
        background: transparent;
      }
      pre {
        overflow: auto;
        white-space: pre-wrap;
        background: var(--vscode-textCodeBlock-background);
        padding: 12px;
        border-radius: 8px;
      }
    </style>
    <title>GuidedPatch</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
