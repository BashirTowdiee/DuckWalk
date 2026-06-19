import type { GuidedSession, GuidedStep } from "@duckwalk/schema";

import type { GuidanceMode } from "./types";
import {
  SymbolChips,
  formatRangeLabel,
  getGuidanceModeLabel,
  getStepLocationLabels,
  postSidebarMessage
} from "./webview-shared";

type WalkthroughStep = Extract<GuidedStep, { mode: "codebase_walkthrough" }>;

export function FlowSummaryPanel({ session }: { session: GuidedSession }) {
  if (session.mode !== "codebase_walkthrough" || !session.flow) {
    return null;
  }
  const flow = session.flow;

  return (
    <section
      style={{
        display: "grid",
        gap: 8,
        padding: 10,
        borderRadius: 8,
        border: "1px solid var(--vscode-widget-border)",
        background: "var(--vscode-editorWidget-background)"
      }}
    >
      <strong className="sectionHeading">Flow Summary</strong>
      <small>{flow.summary}</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {flow.path.map((segment, index) => (
          <span key={`${segment}-${index}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                border: "1px solid var(--vscode-widget-border)",
                borderRadius: 6,
                padding: "4px 8px",
                background: "var(--vscode-badge-background)",
                color: "var(--vscode-badge-foreground)"
              }}
            >
              {segment}
            </span>
            {index < flow.path.length - 1 ? <small>→</small> : null}
          </span>
        ))}
      </div>
      {flow.entrypoint ? (
        <small>
          <strong>Entrypoint:</strong> {flow.entrypoint}
        </small>
      ) : null}
      {flow.outcome ? (
        <small>
          <strong>Outcome:</strong> {flow.outcome}
        </small>
      ) : null}
      {session.followUps?.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          <strong className="detailHeading">Follow-ups</strong>
          {session.followUps.map((followUp) => (
            <button
              key={followUp.id}
              className="secondary rowButton"
              onClick={() => {
                if (followUp.stepId) {
                  postSidebarMessage({ type: "select-step", stepId: followUp.stepId });
                  return;
                }
                if (followUp.file) {
                  postSidebarMessage({ type: "open-file", path: followUp.file });
                }
              }}
            >
              <strong>
                {followUp.label} [{followUp.kind}]
              </strong>
              <small>{followUp.description}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function WalkthroughGraph({
  session,
  activeStepId
}: {
  session: GuidedSession;
  activeStepId: string | null;
}) {
  if (session.mode !== "codebase_walkthrough") {
    return null;
  }

  const orderedSteps = [...session.steps].sort(
    (left, right) => left.order - right.order
  ) as WalkthroughStep[];

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <strong className="sectionHeading">Graph View</strong>
      {orderedSteps.map((step) => (
        <button
          key={step.id}
          className="secondary rowButton"
          onClick={() => postSidebarMessage({ type: "select-step", stepId: step.id })}
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${
              step.id === activeStepId ? "var(--vscode-focusBorder)" : "var(--vscode-widget-border)"
            }`,
            background:
              step.id === activeStepId
                ? "var(--vscode-list-activeSelectionBackground)"
                : "transparent"
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <strong>
              {step.order}. {step.explanation.title}
            </strong>
            <small>{step.file.path}</small>
            <small>
              {step.touchpoint} · {step.confidence} · {step.evidenceQuality}
            </small>
          </div>
          <SymbolChips symbols={step.symbols} />
          <div style={{ display: "grid", gap: 6 }}>
            {(step.links ?? []).length > 0 ? (
              step.links?.map((link) => (
                <div
                  key={`${step.id}-${link.stepId}-${link.type}`}
                  style={{
                    borderLeft: "2px solid var(--vscode-focusBorder)",
                    paddingLeft: 8,
                    display: "grid",
                    gap: 2
                  }}
                >
                  <small>
                    <strong>{link.type}</strong> → {link.stepId}
                    {link.viaSymbol ? ` via ${link.viaSymbol}` : ""}
                  </small>
                  <small>{link.why}</small>
                </div>
              ))
            ) : (
              <small>No outgoing links.</small>
            )}
          </div>
        </button>
      ))}
    </section>
  );
}

export function StepDetails({
  step,
  status,
  guidanceMode,
  guidanceHelp,
  activeEvidenceId
}: {
  step: GuidedStep;
  status: string;
  guidanceMode: GuidanceMode;
  guidanceHelp: string;
  activeEvidenceId: string | null;
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
      {step.mode === "codebase_walkthrough" ? (
        <>
          <small>Where: {getStepLocationLabels(step).join("; ")}</small>
          <small>
            <strong>Touchpoint:</strong> {step.touchpoint} · <strong>Confidence:</strong> {step.confidence} ·{" "}
            <strong>Evidence:</strong> {step.evidenceQuality}
          </small>
          <small>
            <strong>Why this file:</strong> {step.fileRationale}
          </small>
        </>
      ) : null}
      {step.mode === "implementation" && status === "complete" ? (
        <small>Use the `Incomplete` button on the step row to reopen this step and reset later steps.</small>
      ) : null}
      <SymbolChips symbols={step.symbols} />

      <div style={{ display: "grid", gap: 6 }}>
        <DetailBlock label="What" value={step.explanation.what} />
        <DetailBlock label="Why" value={step.explanation.why} />
        {step.explanation.how ? <DetailBlock label="How" value={step.explanation.how} /> : null}
        {step.explanation.impact ? <DetailBlock label="Impact" value={step.explanation.impact} /> : null}
        {step.explanation.risk ? <DetailBlock label="Risk" value={step.explanation.risk} /> : null}
      </div>

      {step.mode === "implementation" ? (
        <>
          <strong className="detailHeading">Ghost Code</strong>
          <pre>{step.ghostCode}</pre>
        </>
      ) : step.mode === "pr_review" ? (
        <>
          {step.review.beforeCode ? <CodePanel heading="Before" code={step.review.beforeCode} /> : null}
          {step.review.afterCode ? <CodePanel heading="After" code={step.review.afterCode} /> : null}
        </>
      ) : (
        <>
          <CodePanel heading="Snippet" code={step.snippet} />
          {step.links?.length ? (
            <section style={{ display: "grid", gap: 8 }}>
              <strong className="detailHeading">Connects To</strong>
              {step.links.map((link) => (
                <button
                  key={`${step.id}-${link.stepId}-${link.type}`}
                  className="secondary rowButton"
                  onClick={() =>
                    postSidebarMessage({
                      type: "select-step",
                      stepId: link.stepId,
                      evidenceId: link.subrangeId
                    })
                  }
                >
                  <strong>
                    {link.type} → {link.stepId}
                    {link.subrangeId ? `#${link.subrangeId}` : ""}
                  </strong>
                  <small>
                    {link.why}
                    {link.viaSymbol ? ` via ${link.viaSymbol}` : ""}
                  </small>
                </button>
              ))}
            </section>
          ) : null}
          {step.branches?.length ? (
            <section style={{ display: "grid", gap: 8 }}>
              <strong className="detailHeading">Branches</strong>
              {step.branches.map((branch) => (
                <button
                  key={branch.id}
                  className="secondary rowButton"
                  onClick={() => {
                    if (branch.targetStepId) {
                      postSidebarMessage({
                        type: "select-step",
                        stepId: branch.targetStepId,
                        evidenceId: branch.targetSubrangeId
                      });
                    }
                  }}
                >
                  <strong>{branch.label}</strong>
                  <small>
                    {branch.condition}
                    {branch.targetStepId
                      ? ` -> ${branch.targetStepId}${branch.targetSubrangeId ? `#${branch.targetSubrangeId}` : ""}`
                      : ""}
                  </small>
                  <small>{branch.outcome}</small>
                </button>
              ))}
            </section>
          ) : null}
          {step.subranges?.length ? (
            <section style={{ display: "grid", gap: 8 }}>
              <strong className="detailHeading">Evidence</strong>
              {step.subranges.map((subrange) => {
                const isActive = activeEvidenceId === subrange.id;

                return (
                  <div
                    key={subrange.id}
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: 10,
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
                      onClick={() =>
                        postSidebarMessage({
                          type: "select-evidence",
                          stepId: step.id,
                          evidenceId: subrange.id
                        })
                      }
                    >
                      <strong>{subrange.label}</strong>
                      <small>
                        {subrange.role} · {formatRangeLabel(subrange.range)}
                      </small>
                    </button>

                    {isActive ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {subrange.summary ? <small>{subrange.summary}</small> : null}
                        <SymbolChips symbols={subrange.symbols} />
                        {subrange.snippet ? <pre>{subrange.snippet}</pre> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong className="detailHeading">{label}</strong>
      <div>{value}</div>
    </div>
  );
}

function CodePanel({ heading, code }: { heading: string; code: string }) {
  return (
    <>
      <strong className="detailHeading">{heading}</strong>
      <pre>{code}</pre>
    </>
  );
}
