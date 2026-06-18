import * as vscode from "vscode";

import type { SidebarController, WebviewState } from "./types";

export class DuckWalkViewProvider implements vscode.WebviewViewProvider {
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
      * {
        box-sizing: border-box;
      }
      button {
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-radius: 6px;
        min-height: 32px;
        padding: 6px 10px;
        cursor: pointer;
        font: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      select {
        border: 1px solid var(--vscode-dropdown-border, transparent);
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border-radius: 6px;
        min-height: 32px;
        padding: 6px 10px;
        width: 100%;
        font: inherit;
      }
      button.secondary {
        background: transparent;
      }
      button.compact {
        white-space: nowrap;
        padding-inline: 10px;
      }
      button.iconButton {
        min-width: 28px;
        padding-inline: 8px;
      }
      button.rowButton {
        width: 100%;
        justify-content: flex-start;
        align-items: flex-start;
        flex-direction: column;
        text-align: left;
        gap: 4px;
        min-width: 0;
      }
      .stepListScroll {
        max-height: 252px;
        overflow-y: auto;
        padding-right: 2px;
      }
      .sidebarTitle {
        color: var(--vscode-textLink-foreground);
        letter-spacing: 0.01em;
      }
      .sessionTitle {
        color: var(--vscode-foreground);
        font-weight: 700;
      }
      .sectionHeading {
        color: var(--vscode-textLink-foreground);
      }
      .detailHeading {
        color: var(--vscode-textPreformat-foreground);
      }
      .stepTitle {
        color: var(--vscode-foreground);
      }
      .stepTitleActive {
        color: var(--vscode-textLink-foreground);
      }
      .statusActive {
        color: var(--vscode-textLink-foreground);
        font-weight: 600;
      }
      .statusComplete {
        color: var(--vscode-testing-iconPassed);
        font-weight: 600;
      }
      small {
        color: var(--vscode-descriptionForeground);
      }
      pre {
        overflow: auto;
        white-space: pre-wrap;
        background: var(--vscode-textCodeBlock-background);
        padding: 12px;
        border-radius: 8px;
      }
    </style>
    <title>duckWalk</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
