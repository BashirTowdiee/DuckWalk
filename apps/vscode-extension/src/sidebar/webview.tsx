import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type { WebviewState } from "./types";
import { FlowSummaryPanel, StepDetails, WalkthroughGraph } from "./walkthrough-components";
import {
  getGuidanceModeHelp,
  getStepLocationLabels,
  getWalkthroughStepSymbols,
  guidanceModeOptions,
  SymbolChips,
  postSidebarMessage
} from "./webview-shared";

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: unknown) => void;
    };
  }
}

const initialState: WebviewState = {
  session: null,
  guidedState: null,
  activeStepId: null,
  activeEvidenceId: null,
  walkthroughDrift: null,
  isPlaying: false,
  guidanceMode: "diff",
  tabAcceptEnabled: false,
  error: null
};

type WalkthroughView = "story" | "graph";

function App() {
  const [state, setState] = useState<WebviewState>(initialState);
  const [walkthroughView, setWalkthroughView] = useState<WalkthroughView>("story");

  useEffect(() => {
    const listener = (event: MessageEvent<{ type: string; payload: WebviewState }>) => {
      if (event.data?.type === "state") {
        setState(event.data.payload);
      }
    };

    window.addEventListener("message", listener);
    postSidebarMessage({ type: "refresh-session" });
    return () => window.removeEventListener("message", listener);
  }, []);

  const orderedSteps = useMemo(
    () => [...(state.session?.steps ?? [])].sort((left, right) => left.order - right.order),
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
              <>
                <small>
                  <strong>Question:</strong> {state.session.question}
                </small>
                {state.session.lens ? (
                  <small>
                    <strong>Lens:</strong> {state.session.lens}
                  </small>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <small>No `.guided-implementation/current.recipe.json` file is loaded.</small>
        )}
        {state.error ? <small style={{ color: "#d84a4a" }}>{state.error}</small> : null}
        {state.walkthroughDrift?.status === "stale" ? (
          <small style={{ color: "#d8a54a" }}>
            <strong>Walkthrough drift:</strong> {state.walkthroughDrift.issues[0] ?? "Saved evidence no longer matches the repo."}
          </small>
        ) : null}
      </header>

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <button onClick={() => postSidebarMessage({ type: "start-session" })}>Start Session</button>
          <button className="secondary" onClick={() => postSidebarMessage({ type: "previous-step" })}>
            Previous
          </button>
          <button className="secondary" onClick={() => postSidebarMessage({ type: "next-step" })}>
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
                    postSidebarMessage({
                      type: "set-guidance-mode",
                      mode: event.currentTarget.value as WebviewState["guidanceMode"]
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

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: isPrReviewSession ? "flex-start" : "flex-end"
              }}
            >
              {isImplementationSession && state.guidanceMode === "suggest" ? (
                <button
                  className="secondary compact"
                  onClick={() => postSidebarMessage({ type: "toggle-tab-accept" })}
                >
                  Tab {state.tabAcceptEnabled ? "On" : "Off"}
                </button>
              ) : null}
              {isPrReviewSession ? (
                <button className="compact" onClick={() => postSidebarMessage({ type: "toggle-playback" })}>
                  {state.isPlaying ? "Pause" : "Play"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {state.session ? <FlowSummaryPanel session={state.session} /> : null}

      {isWalkthroughSession ? (
        <section style={{ display: "flex", gap: 8 }}>
          <button
            className={walkthroughView === "story" ? "compact" : "secondary compact"}
            onClick={() => setWalkthroughView("story")}
          >
            Story
          </button>
          <button
            className={walkthroughView === "graph" ? "compact" : "secondary compact"}
            onClick={() => setWalkthroughView("graph")}
          >
            Graph
          </button>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 8 }}>
        <div className="stepListScroll">
          <div style={{ display: "grid", gap: 8 }}>
            {orderedSteps.map((step) => {
              const isActive = step.id === activeStep?.id;
              const status = stepStatus(step.id);
              const canToggleCompletion = step.mode === "implementation";
              const locationLabel = getStepLocationLabels(step).join("; ");
              const symbols = getWalkthroughStepSymbols(step);

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
                    onClick={() => postSidebarMessage({ type: "select-step", stepId: step.id })}
                  >
                    <strong className={isActive ? "stepTitle stepTitleActive" : "stepTitle"}>
                      {step.order}. {step.explanation.title}
                    </strong>
                    {isWalkthroughSession ? (
                      <>
                        <small>{step.file.path}</small>
                        <small>{locationLabel}</small>
                        <SymbolChips symbols={symbols} />
                      </>
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
                        postSidebarMessage({
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

      {isWalkthroughSession && state.session && walkthroughView === "graph" ? (
        <WalkthroughGraph session={state.session} activeStepId={state.activeStepId} />
      ) : activeStep ? (
        <StepDetails
          step={activeStep}
          status={activeStepStatus}
          guidanceMode={state.guidanceMode}
          guidanceHelp={guidanceHelp}
          activeEvidenceId={state.activeEvidenceId}
        />
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
