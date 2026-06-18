import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type { GuidedStep } from "@duckwalk/schema";

import type { GuidanceMode, SidebarMessage, WebviewState } from "./types";

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: SidebarMessage) => void;
    };
  }
}

const vscode = window.acquireVsCodeApi();

const initialState: WebviewState = {
  session: null,
  guidedState: null,
  activeStepId: null,
  isPlaying: false,
  guidanceMode: "diff",
  tabAcceptEnabled: false,
  error: null
};

const guidanceModeOptions: Array<{ value: GuidanceMode; label: string }> = [
  { value: "diff", label: "Diff Preview" },
  { value: "inline", label: "Ghost Inline" },
  { value: "hover", label: "Hover" },
  { value: "peek", label: "Peek Preview" },
  { value: "suggest", label: "Suggestion Widget" }
];

function getGuidanceModeLabel(mode: GuidanceMode) {
  return guidanceModeOptions.find((option) => option.value === mode)?.label ?? mode;
}

function getGuidanceModeHelp(mode: GuidanceMode, tabAcceptEnabled: boolean) {
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

function getStepLocationLabel(step: GuidedStep) {
  if (step.mode === "pr_review" && step.review.changedRange) {
    const range = step.review.changedRange;
    return `${range.startLine}:${range.startCharacter} - ${range.endLine}:${range.endCharacter}`;
  }

  if (step.location.strategy === "range" && step.location.range) {
    const range = step.location.range;
    return `${range.startLine}:${range.startCharacter} - ${range.endLine}:${range.endCharacter}`;
  }

  if (step.location.strategy === "line" && step.location.line) {
    return `${step.location.line}:${step.location.column ?? 0}`;
  }

  if (
    (step.location.strategy === "after_text" || step.location.strategy === "before_text") &&
    step.location.anchorText
  ) {
    return step.location.anchorText;
  }

  return step.location.strategy;
}

function App() {
  const [state, setState] = useState<WebviewState>(initialState);

  useEffect(() => {
    const listener = (event: MessageEvent<{ type: string; payload: WebviewState }>) => {
      if (event.data?.type === "state") {
        setState(event.data.payload);
      }
    };

    window.addEventListener("message", listener);
    vscode.postMessage({ type: "refresh-session" });
    return () => window.removeEventListener("message", listener);
  }, []);

  const orderedSteps = useMemo(
    () =>
      [...(state.session?.steps ?? [])].sort((left, right) => left.order - right.order),
    [state.session]
  );

  const activeStep = orderedSteps.find((step) => step.id === state.activeStepId) ?? orderedSteps[0];

  const stepStatus = (stepId: string) => state.guidedState?.steps[stepId]?.status ?? "pending";
  const activeStepStatus = activeStep ? stepStatus(activeStep.id) : "pending";
  const guidanceHelp = getGuidanceModeHelp(state.guidanceMode, state.tabAcceptEnabled);
  const isImplementationSession = state.session?.mode === "implementation";
  const isPrReviewSession = state.session?.mode === "pr_review";
  const isWalkthroughSession = state.session?.mode === "codebase_walkthrough";

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <strong className="sidebarTitle">duckWalk</strong>
        {state.session ? (
          <>
            <span className="sessionTitle">{state.session.title}</span>
            <small>{state.session.summary}</small>
            {isWalkthroughSession && state.session.question ? (
              <small>
                <strong>Question:</strong> {state.session.question}
              </small>
            ) : null}
          </>
        ) : (
          <small>No `.guided-implementation/current.recipe.json` file is loaded.</small>
        )}
        {state.error ? <small style={{ color: "#d84a4a" }}>{state.error}</small> : null}
      </header>

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <button onClick={() => vscode.postMessage({ type: "start-session" })}>Start Session</button>
          <button
            className="secondary"
            onClick={() => vscode.postMessage({ type: "previous-step" })}
          >
            Previous
          </button>
          <button className="secondary" onClick={() => vscode.postMessage({ type: "next-step" })}>
            Next
          </button>
        </div>

        {isImplementationSession || isPrReviewSession ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isImplementationSession ? "minmax(0, 1fr) auto" : "auto",
              gap: 8,
              alignItems: "end"
            }}
          >
            {isImplementationSession ? (
              <label style={{ display: "grid", gap: 4 }}>
                <small>Guidance Mode</small>
                <select
                  value={state.guidanceMode}
                  onChange={(event) =>
                    vscode.postMessage({
                      type: "set-guidance-mode",
                      mode: event.currentTarget.value as GuidanceMode
                    })
                  }
                >
                  {guidanceModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: isPrReviewSession ? "flex-start" : "flex-end" }}>
              {isImplementationSession && state.guidanceMode === "suggest" ? (
                <button
                  className="secondary compact"
                  onClick={() => vscode.postMessage({ type: "toggle-tab-accept" })}
                >
                  Tab {state.tabAcceptEnabled ? "On" : "Off"}
                </button>
              ) : null}
              {isPrReviewSession ? (
                <button
                  className="compact"
                  onClick={() => vscode.postMessage({ type: "toggle-playback" })}
                >
                  {state.isPlaying ? "Pause" : "Play"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <div className="stepListScroll">
          <div style={{ display: "grid", gap: 8 }}>
            {orderedSteps.map((step) => {
              const isActive = step.id === activeStep?.id;
              const status = stepStatus(step.id);
              const canToggleCompletion = step.mode === "implementation";
              const locationLabel = getStepLocationLabel(step);
              return (
                <div
                  key={step.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    padding: 8,
                    borderRadius: 8,
                    border: `1px solid ${
                      isActive ? "var(--vscode-focusBorder)" : "var(--vscode-widget-border)"
                    }`,
                    background: isActive
                      ? "var(--vscode-list-activeSelectionBackground)"
                      : "transparent"
                  }}
                >
                  <button
                    className="secondary rowButton"
                    onClick={() => vscode.postMessage({ type: "select-step", stepId: step.id })}
                  >
                    <strong className={isActive ? "stepTitle stepTitleActive" : "stepTitle"}>
                      {step.order}. {step.explanation.title}
                    </strong>
                    {isWalkthroughSession ? (
                      <small>
                        {step.file.path} · {locationLabel}
                      </small>
                    ) : (
                      <small>
                        {step.file.path} ·{" "}
                        <span className={status === "complete" ? "statusComplete" : "statusActive"}>
                          {status}
                        </span>
                      </small>
                    )}
                  </button>

                  {canToggleCompletion ? (
                    <button
                      className={status === "complete" ? "secondary compact" : "compact"}
                      onClick={() =>
                        vscode.postMessage({
                          type: "set-step-completion",
                          stepId: step.id,
                          complete: status !== "complete"
                        })
                      }
                    >
                      {status === "complete" ? "Incomplete" : "Complete"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {activeStep ? (
        <StepDetails
          step={activeStep}
          status={activeStepStatus}
          guidanceMode={state.guidanceMode}
          guidanceHelp={guidanceHelp}
        />
      ) : null}
    </div>
  );
}

function StepDetails({
  step,
  status,
  guidanceMode,
  guidanceHelp
}: {
  step: GuidedStep;
  status: string;
  guidanceMode: GuidanceMode;
  guidanceHelp: string;
}) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong className="sectionHeading">Active Step</strong>
        {step.mode === "implementation" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <small>{getGuidanceModeLabel(guidanceMode)}</small>
            <button className="secondary iconButton" title={guidanceHelp} aria-label="Guidance info">
              i
            </button>
          </div>
        ) : null}
      </div>
      <small>{step.file.path}</small>
      {step.mode === "codebase_walkthrough" ? <small>Where: {getStepLocationLabel(step)}</small> : null}
      {step.mode === "implementation" && status === "complete" ? (
        <small>Use the `Incomplete` button on the step row to reopen this step and reset later steps.</small>
      ) : null}
      <div style={{ display: "grid", gap: 6 }}>
        <div>
          <strong className="detailHeading">What</strong>
          <div>{step.explanation.what}</div>
        </div>
        <div>
          <strong className="detailHeading">Why</strong>
          <div>{step.explanation.why}</div>
        </div>
        {step.explanation.how ? (
          <div>
            <strong className="detailHeading">How</strong>
            <div>{step.explanation.how}</div>
          </div>
        ) : null}
        {step.explanation.impact ? (
          <div>
            <strong className="detailHeading">Impact</strong>
            <div>{step.explanation.impact}</div>
          </div>
        ) : null}
        {step.explanation.risk ? (
          <div>
            <strong className="detailHeading">Risk</strong>
            <div>{step.explanation.risk}</div>
          </div>
        ) : null}
      </div>
      {step.mode === "implementation" ? (
        <>
          <strong className="detailHeading">Ghost Code</strong>
          <pre>{step.ghostCode}</pre>
        </>
      ) : step.mode === "pr_review" ? (
        <>
          {step.review.beforeCode ? (
            <>
              <strong className="detailHeading">Before</strong>
              <pre>{step.review.beforeCode}</pre>
            </>
          ) : null}
          {step.review.afterCode ? (
            <>
              <strong className="detailHeading">After</strong>
              <pre>{step.review.afterCode}</pre>
            </>
          ) : null}
        </>
      ) : (
        <>
          <strong className="detailHeading">Snippet</strong>
          <pre>{step.snippet}</pre>
        </>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
