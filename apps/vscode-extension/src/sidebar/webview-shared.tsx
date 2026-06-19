import type { GuidedStep, WalkthroughSubrange } from "@duckwalk/schema";

import type { GuidanceMode, SidebarMessage } from "./types";

const vscodeApi = window.acquireVsCodeApi();

export const guidanceModeOptions: Array<{ value: GuidanceMode; label: string }> = [
  { value: "diff", label: "Diff Preview" },
  { value: "inline", label: "Ghost Inline" },
  { value: "hover", label: "Hover" },
  { value: "peek", label: "Peek Preview" },
  { value: "suggest", label: "Suggestion Widget" }
];

export function getGuidanceModeLabel(mode: GuidanceMode) {
  return guidanceModeOptions.find((option) => option.value === mode)?.label ?? mode;
}

export function getGuidanceModeHelp(mode: GuidanceMode, tabAcceptEnabled: boolean) {
  const tabCopy =
    mode === "suggest"
      ? ` Tab Apply is currently ${tabAcceptEnabled ? "on" : "off"}.`
      : "";

  switch (mode) {
    case "diff":
      return "Shows the full guided code in a beside-editor preview and highlights only the code that still needs to be inserted.";
    case "inline":
      return "Shows the remaining guided code inline in the editor as dim ghost text.";
    case "hover":
      return "Shows the full guided code in the editor hover popup.";
    case "peek":
      return "Shows the full guided code in a beside-editor preview tab.";
    case "suggest":
      return `Shows the guided code through the completion suggestion widget.${tabCopy}`;
  }
}

export function formatRangeLabel(range: WalkthroughSubrange["range"]) {
  return `${range.startLine}:${range.startCharacter} - ${range.endLine}:${range.endCharacter}`;
}

export function getStepLocationLabels(step: GuidedStep) {
  if (step.mode === "codebase_walkthrough" && step.subranges?.length) {
    return step.subranges.map(
      (subrange) => `${subrange.label} (${subrange.role}): ${formatRangeLabel(subrange.range)}`
    );
  }

  if (step.mode === "pr_review" && step.review.changedRange) {
    return [formatRangeLabel(step.review.changedRange)];
  }

  if (step.location.strategy === "range" && step.location.range) {
    return [formatRangeLabel(step.location.range)];
  }

  if (step.location.strategy === "line" && step.location.line) {
    return [`${step.location.line}:${step.location.column ?? 0}`];
  }

  if (
    (step.location.strategy === "after_text" || step.location.strategy === "before_text") &&
    step.location.anchorText
  ) {
    return [step.location.anchorText];
  }

  return [step.location.strategy];
}

export function getWalkthroughStepSymbols(step: GuidedStep) {
  return step.symbols ?? [];
}

export function SymbolChips({ symbols }: { symbols?: string[] | undefined }) {
  if (!symbols?.length) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {symbols.map((symbol) => (
        <span
          key={symbol}
          style={{
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 12,
            color: "var(--vscode-descriptionForeground)"
          }}
        >
          {symbol}
        </span>
      ))}
    </div>
  );
}

export function postSidebarMessage(message: SidebarMessage) {
  vscodeApi.postMessage(message);
}
