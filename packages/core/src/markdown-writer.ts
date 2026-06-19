import type { GuidedSession } from "@duckwalk/schema";

function formatStepLocation(step: GuidedSession["steps"][number]): string | null {
  const labels: string[] = [];

  if (step.mode === "pr_review" && step.review.changedRange) {
    labels.push(
      `${step.review.changedRange.startLine}:${step.review.changedRange.startCharacter} - ${step.review.changedRange.endLine}:${step.review.changedRange.endCharacter}`
    );
  } else if (step.location.strategy === "range" && step.location.range) {
    labels.push(
      `${step.location.range.startLine}:${step.location.range.startCharacter} - ${step.location.range.endLine}:${step.location.range.endCharacter}`
    );
  } else if (step.location.strategy === "line" && step.location.line) {
    labels.push(`${step.location.line}:${step.location.column ?? 0}`);
  } else if (
    (step.location.strategy === "after_text" || step.location.strategy === "before_text") &&
    step.location.anchorText
  ) {
    labels.push(step.location.anchorText);
  }

  for (const subrange of step.subranges ?? []) {
    labels.push(
      `${subrange.label} (${subrange.role}): ${subrange.range.startLine}:${subrange.range.startCharacter} - ${subrange.range.endLine}:${subrange.range.endCharacter}`
    );
  }

  return labels.length > 0 ? labels.join("; ") : null;
}

export function renderSessionMarkdown(session: GuidedSession): string {
  const lines: string[] = [
    `# ${session.title}`,
    "",
    `- Session ID: \`${session.id}\``,
    `- Mode: \`${session.mode}\``,
    `- Created At: \`${session.createdAt}\``,
    "",
    session.summary
  ];

  if (session.mode === "codebase_walkthrough" && session.question) {
    lines.push("", `Question: ${session.question}`);
  }
  if (session.mode === "codebase_walkthrough" && session.lens) {
    lines.push(`Lens: ${session.lens}`);
  }

  if (session.mode === "codebase_walkthrough" && session.flow) {
    lines.push("", "## Flow Summary", "");
    lines.push(`- Summary: ${session.flow.summary}`);
    lines.push(`- Path: ${session.flow.path.join(" -> ")}`);
    if (session.flow.entrypoint) {
      lines.push(`- Entrypoint: ${session.flow.entrypoint}`);
    }
    if (session.flow.outcome) {
      lines.push(`- Outcome: ${session.flow.outcome}`);
    }
  }

  lines.push("");

  for (const step of [...session.steps].sort((left, right) => left.order - right.order)) {
    lines.push(`## Step ${step.order}: ${step.explanation.title}`, "");
    lines.push(`- File: \`${step.file.path}\``);
    lines.push(`- Location strategy: \`${step.location.strategy}\``);
    const locationDetail = formatStepLocation(step);
    if (locationDetail) {
      lines.push(`- Where: ${locationDetail}`);
    }
    if (step.mode === "codebase_walkthrough") {
      lines.push(`- Touchpoint: ${step.touchpoint}`);
      lines.push(`- Confidence: ${step.confidence}`);
      lines.push(`- Evidence quality: ${step.evidenceQuality}`);
      lines.push(`- File rationale: ${step.fileRationale}`);
    }
    lines.push(`- What: ${step.explanation.what}`);
    lines.push(`- Why: ${step.explanation.why}`);
    if (step.explanation.how) {
      lines.push(`- How: ${step.explanation.how}`);
    }
    if (step.explanation.impact) {
      lines.push(`- Impact: ${step.explanation.impact}`);
    }
    if (step.explanation.risk) {
      lines.push(`- Risk: ${step.explanation.risk}`);
    }
    if (step.symbols?.length) {
      lines.push(`- Symbols: ${step.symbols.join(", ")}`);
    }
    lines.push("");

    if (step.mode === "implementation") {
      lines.push("```ts", step.ghostCode, "```", "");
    } else if (step.mode === "pr_review") {
      if (step.review.beforeCode) {
        lines.push("### Before", "", "```ts", step.review.beforeCode, "```", "");
      }
      if (step.review.afterCode) {
        lines.push("### After", "", "```ts", step.review.afterCode, "```", "");
      }
    } else {
      lines.push("### Snippet", "", "```ts", step.snippet, "```", "");
      if (step.subranges?.length) {
        lines.push("### Evidence", "");

        for (const subrange of step.subranges) {
          lines.push(
            `- ${subrange.label} [${subrange.role}] ${subrange.range.startLine}:${subrange.range.startCharacter} - ${subrange.range.endLine}:${subrange.range.endCharacter}`
          );
          if (subrange.summary) {
            lines.push(`  Summary: ${subrange.summary}`);
          }
          if (subrange.symbols?.length) {
            lines.push(`  Symbols: ${subrange.symbols.join(", ")}`);
          }
          if (subrange.snippet) {
            lines.push("", "```ts", subrange.snippet, "```");
          }
        }

        lines.push("");
      }

      if (step.links?.length) {
        lines.push("### Links", "");
        for (const link of step.links) {
          const via = link.viaSymbol ? ` via ${link.viaSymbol}` : "";
          const target = link.subrangeId ? `${link.stepId}#${link.subrangeId}` : link.stepId;
          lines.push(`- ${link.type} -> ${target}${via}: ${link.why}`);
        }
        lines.push("");
      }

      if (step.branches?.length) {
        lines.push("### Branches", "");
        for (const branch of step.branches) {
          const target = branch.targetStepId
            ? ` -> ${branch.targetStepId}${branch.targetSubrangeId ? `#${branch.targetSubrangeId}` : ""}`
            : "";
          lines.push(`- ${branch.label}${target}`);
          lines.push(`  Condition: ${branch.condition}`);
          lines.push(`  Outcome: ${branch.outcome}`);
        }
        lines.push("");
      }
    }
  }

  if (session.mode === "codebase_walkthrough" && session.followUps?.length) {
    lines.push("## Follow-ups", "");
    for (const followUp of session.followUps) {
      const target = followUp.stepId
        ? `step ${followUp.stepId}`
        : followUp.file
          ? `file ${followUp.file}`
          : "general";
      lines.push(`- ${followUp.label} [${followUp.kind}] (${target})`);
      lines.push(`  ${followUp.description}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
