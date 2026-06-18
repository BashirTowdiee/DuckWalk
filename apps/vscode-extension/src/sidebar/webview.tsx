import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type { GuidedStep } from "@guidedpatch/schema";

import type { SidebarMessage, WebviewState } from "./types";

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
  error: null
};

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

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <strong>GuidedPatch</strong>
        {state.session ? (
          <>
            <span>{state.session.title}</span>
            <small>{state.session.summary}</small>
          </>
        ) : (
          <small>No `.guided-implementation/current.recipe.json` file is loaded.</small>
        )}
        {state.error ? <small style={{ color: "#d84a4a" }}>{state.error}</small> : null}
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={() => vscode.postMessage({ type: "start-session" })}>Start Session</button>
        <button className="secondary" onClick={() => vscode.postMessage({ type: "previous-step" })}>
          Previous
        </button>
        <button className="secondary" onClick={() => vscode.postMessage({ type: "next-step" })}>
          Next
        </button>
        {activeStep?.mode === "implementation" && activeStepStatus !== "complete" ? (
          <button onClick={() => vscode.postMessage({ type: "complete-step" })}>Mark Complete</button>
        ) : null}
        {state.session?.mode === "pr_review" ? (
          <button onClick={() => vscode.postMessage({ type: "toggle-playback" })}>
            {state.isPlaying ? "Pause" : "Play"}
          </button>
        ) : null}
      </div>

      <section style={{ display: "grid", gap: 8 }}>
        {orderedSteps.map((step) => {
          const isActive = step.id === activeStep?.id;
          return (
            <button
              key={step.id}
              className="secondary"
              onClick={() => vscode.postMessage({ type: "select-step", stepId: step.id })}
              style={{
                textAlign: "left",
                display: "grid",
                gap: 4,
                padding: 10,
                borderRadius: 8,
                borderColor: isActive ? "var(--vscode-focusBorder)" : "var(--vscode-widget-border)",
                background: isActive ? "var(--vscode-list-activeSelectionBackground)" : "transparent"
              }}
            >
              <strong>
                {step.order}. {step.explanation.title}
              </strong>
              <small>
                {step.file.path} · {stepStatus(step.id)}
              </small>
            </button>
          );
        })}
      </section>

      {activeStep ? <StepDetails step={activeStep} status={activeStepStatus} /> : null}
    </div>
  );
}

function StepDetails({ step, status }: { step: GuidedStep; status: string }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <strong>Active Step</strong>
      <small>{step.file.path}</small>
      {step.mode === "implementation" && status !== "complete" ? (
        <small>
          Auto-complete only works for close text matches. If you intentionally rename symbols or
          restructure equivalent code, use `Mark Complete`.
        </small>
      ) : null}
      <div style={{ display: "grid", gap: 6 }}>
        <div>
          <strong>What</strong>
          <div>{step.explanation.what}</div>
        </div>
        <div>
          <strong>Why</strong>
          <div>{step.explanation.why}</div>
        </div>
        {step.explanation.impact ? (
          <div>
            <strong>Impact</strong>
            <div>{step.explanation.impact}</div>
          </div>
        ) : null}
        {step.explanation.risk ? (
          <div>
            <strong>Risk</strong>
            <div>{step.explanation.risk}</div>
          </div>
        ) : null}
      </div>
      {step.mode === "implementation" ? (
        <>
          <strong>Ghost Code</strong>
          <pre>{step.ghostCode}</pre>
        </>
      ) : (
        <>
          {step.review.beforeCode ? (
            <>
              <strong>Before</strong>
              <pre>{step.review.beforeCode}</pre>
            </>
          ) : null}
          {step.review.afterCode ? (
            <>
              <strong>After</strong>
              <pre>{step.review.afterCode}</pre>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
