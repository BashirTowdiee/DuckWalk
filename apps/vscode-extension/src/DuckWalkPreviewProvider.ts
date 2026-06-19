import * as vscode from "vscode";

export class DuckWalkPreviewProvider implements vscode.TextDocumentContentProvider {
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
