import { useMemo, useState } from "react";

import type { GuidedSessionHistoryEntry, GuidedSessionHistoryStatus } from "@duckwalk/core";
import type { SessionMode } from "@duckwalk/schema";

import { postSidebarMessage } from "./webview-shared";

type ModeFilter = "all" | SessionMode;
type StatusFilter = "all" | GuidedSessionHistoryStatus;

const modeLabels: Record<SessionMode, string> = {
  implementation: "Implementation",
  pr_review: "PR Review",
  codebase_walkthrough: "Walkthrough"
};

const statusTone: Record<GuidedSessionHistoryStatus, string> = {
  pending: "var(--vscode-textLink-foreground)",
  complete: "var(--vscode-testing-iconPassed)"
};

export function SessionHistoryPanel({
  entries,
  currentSessionId
}: {
  entries: GuidedSessionHistoryEntry[];
  currentSessionId: string | null;
}) {
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (modeFilter === "all" || entry.mode === modeFilter) &&
          (statusFilter === "all" || entry.status === statusFilter)
      ),
    [entries, modeFilter, statusFilter]
  );

  if (!entries.length) {
    return null;
  }

  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <strong className="sectionHeading">Session History</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <FilterButton active={modeFilter === "all"} onClick={() => setModeFilter("all")}>
            All Types
          </FilterButton>
          <FilterButton
            active={modeFilter === "implementation"}
            onClick={() => setModeFilter("implementation")}
          >
            Implementation
          </FilterButton>
          <FilterButton active={modeFilter === "pr_review"} onClick={() => setModeFilter("pr_review")}>
            PR Review
          </FilterButton>
          <FilterButton
            active={modeFilter === "codebase_walkthrough"}
            onClick={() => setModeFilter("codebase_walkthrough")}
          >
            Walkthrough
          </FilterButton>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All Statuses
          </FilterButton>
          <FilterButton active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")}>
            Pending
          </FilterButton>
          <FilterButton active={statusFilter === "complete"} onClick={() => setStatusFilter("complete")}>
            Complete
          </FilterButton>
        </div>
      </div>

      <div className="stepListScroll">
        <div style={{ display: "grid", gap: 8 }}>
          {filteredEntries.map((entry) => {
            const isCurrent = currentSessionId === entry.id;

            return (
              <button
                key={entry.id}
                className="secondary rowButton"
                onClick={() => postSidebarMessage({ type: "switch-session", sessionId: entry.id })}
                style={{
                  display: "grid",
                  gap: 6,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${
                    isCurrent ? "var(--vscode-focusBorder)" : "var(--vscode-widget-border)"
                  }`,
                  background: isCurrent
                    ? "var(--vscode-list-activeSelectionBackground)"
                    : "transparent"
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <strong>{entry.title}</strong>
                  <Badge>{modeLabels[entry.mode]}</Badge>
                  <Badge tone={statusTone[entry.status]}>{entry.status}</Badge>
                  {isCurrent ? <Badge>Current</Badge> : null}
                </div>
                <small>{entry.summary}</small>
                {entry.question ? <small>Question: {entry.question}</small> : null}
                <small>
                  Progress: {entry.completedStepCount}/{entry.stepCount}
                </small>
              </button>
            );
          })}
          {filteredEntries.length === 0 ? <small>No sessions match the current filters.</small> : null}
        </div>
      </div>
    </section>
  );
}

function FilterButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "compact" : "secondary compact"} onClick={onClick}>
      {children}
    </button>
  );
}

function Badge({
  children,
  tone
}: {
  children: string;
  tone?: string | undefined;
}) {
  return (
    <span
      style={{
        border: "1px solid var(--vscode-widget-border)",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        color: tone ?? "var(--vscode-descriptionForeground)"
      }}
    >
      {children}
    </span>
  );
}
