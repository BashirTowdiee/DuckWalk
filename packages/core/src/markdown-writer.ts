import type { GuidedSession } from "@duckwalk/schema";

function formatStepLocation(step: GuidedSession["steps"][number]): string | null {
  if (step.mode === "pr_review" && step.review.changedRange) {
    return `${step.review.changedRange.startLine}:${step.review.changedRange.startCharacter} - ${step.review.changedRange.endLine}:${step.review.changedRange.endCharacter}`;
  }

  if (step.location.strategy === "range" && step.location.range) {
    return `${step.location.range.startLine}:${step.location.range.startCharacter} - ${step.location.range.endLine}:${step.location.range.endCharacter}`;
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

  return null;
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

  lines.push("");

  for (const step of [...session.steps].sort((left, right) => left.order - right.order)) {
    lines.push(`## Step ${step.order}: ${step.explanation.title}`, "");
    lines.push(`- File: \`${step.file.path}\``);
    lines.push(`- Location strategy: \`${step.location.strategy}\``);
    const locationDetail = formatStepLocation(step);
    if (locationDetail) {
      lines.push(`- Where: ${locationDetail}`);
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
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
