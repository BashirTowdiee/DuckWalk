import type { GuidedSession } from "@guidedpatch/schema";

export function renderSessionMarkdown(session: GuidedSession): string {
  const lines: string[] = [
    `# ${session.title}`,
    "",
    `- Session ID: \`${session.id}\``,
    `- Mode: \`${session.mode}\``,
    `- Created At: \`${session.createdAt}\``,
    "",
    session.summary,
    ""
  ];

  for (const step of [...session.steps].sort((left, right) => left.order - right.order)) {
    lines.push(`## Step ${step.order}: ${step.explanation.title}`, "");
    lines.push(`- File: \`${step.file.path}\``);
    lines.push(`- Location strategy: \`${step.location.strategy}\``);
    lines.push(`- What: ${step.explanation.what}`);
    lines.push(`- Why: ${step.explanation.why}`);
    if (step.explanation.impact) {
      lines.push(`- Impact: ${step.explanation.impact}`);
    }
    if (step.explanation.risk) {
      lines.push(`- Risk: ${step.explanation.risk}`);
    }
    lines.push("");

    if (step.mode === "implementation") {
      lines.push("```ts", step.ghostCode, "```", "");
    } else {
      if (step.review.beforeCode) {
        lines.push("### Before", "", "```ts", step.review.beforeCode, "```", "");
      }
      if (step.review.afterCode) {
        lines.push("### After", "", "```ts", step.review.afterCode, "```", "");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
