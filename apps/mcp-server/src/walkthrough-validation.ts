import { readFile } from "node:fs/promises";
import path from "node:path";

import { normaliseCode } from "@duckwalk/core";
import {
  codebaseWalkthroughStepSchema,
  type CodebaseWalkthroughStep,
  type GuidedRange,
  type GuidedSession,
  type GuidedStep
} from "@duckwalk/schema";

type WalkthroughStepWithEvidence = CodebaseWalkthroughStep & {
  location: {
    strategy: "range";
    range: GuidedRange;
  };
  subranges: NonNullable<CodebaseWalkthroughStep["subranges"]>;
};

export function validatePrReviewStepRanges(session: GuidedSession) {
  for (const step of session.steps) {
    if (
      step.mode !== "pr_review" ||
      ((step.location.strategy !== "range" || !step.location.range) && !step.review.changedRange)
    ) {
      throw new Error(
        `PR review step ${step.id} requires a location range or review.changedRange`
      );
    }
  }
}

export function validateCodebaseWalkthroughSession(
  session: GuidedSession
): WalkthroughStepWithEvidence[] {
  const walkthroughSteps = session.steps.map(parseWalkthroughStep);
  validateWalkthroughGraph(session, walkthroughSteps);
  return walkthroughSteps;
}

export async function validateCodebaseWalkthroughWorkspace(
  rootDir: string,
  walkthroughSteps: WalkthroughStepWithEvidence[]
): Promise<void> {
  for (const step of walkthroughSteps) {
    await validateWalkthroughFileEvidence(rootDir, step);
  }
}

function parseWalkthroughStep(step: GuidedStep): WalkthroughStepWithEvidence {
  if (step.mode !== "codebase_walkthrough") {
    throw new Error(`Codebase walkthrough step ${step.id} requires mode codebase_walkthrough`);
  }
  if (step.location.strategy !== "range" || !step.location.range) {
    throw new Error(`Codebase walkthrough step ${step.id} requires a location range`);
  }

  const walkthroughStep = codebaseWalkthroughStepSchema.parse(step);
  const locationRange = walkthroughStep.location.range;
  if (!locationRange) {
    throw new Error(`Codebase walkthrough step ${walkthroughStep.id} requires a location range`);
  }
  if (!walkthroughStep.subranges?.length) {
    throw new Error(`Codebase walkthrough step ${walkthroughStep.id} requires named subranges`);
  }

  const primarySubranges = walkthroughStep.subranges.filter(
    (subrange) => subrange.role === "primary"
  );
  const primarySubrange = primarySubranges[0];
  if (!primarySubrange || !rangeMatches(primarySubrange.range, locationRange)) {
    throw new Error(
      `Codebase walkthrough step ${walkthroughStep.id} primary subrange must match location.range`
    );
  }

  const seenSubrangeIds = new Set<string>();
  const seenRanges = new Set<string>();
  for (const subrange of walkthroughStep.subranges) {
    if (seenSubrangeIds.has(subrange.id)) {
      throw new Error(
        `Codebase walkthrough step ${walkthroughStep.id} contains duplicate subrange id ${subrange.id}`
      );
    }
    seenSubrangeIds.add(subrange.id);

    const key = rangeKey(subrange.range);
    if (seenRanges.has(key)) {
      throw new Error(
        `Codebase walkthrough step ${walkthroughStep.id} contains duplicate subrange range ${key}`
      );
    }
    seenRanges.add(key);
  }

  return walkthroughStep as WalkthroughStepWithEvidence;
}

function rangeKey(range: GuidedRange) {
  return `${range.startLine}:${range.startCharacter}-${range.endLine}:${range.endCharacter}`;
}

function rangeMatches(left: GuidedRange, right: GuidedRange) {
  return (
    left.startLine === right.startLine &&
    left.startCharacter === right.startCharacter &&
    left.endLine === right.endLine &&
    left.endCharacter === right.endCharacter
  );
}

function getRangeEvidenceText(content: string, range: GuidedRange): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  return lines.slice(range.startLine - 1, range.endLine).join("\n");
}

function snippetsOverlap(actualRangeText: string, expectedSnippet: string): boolean {
  const normalizedActual = normaliseCode(actualRangeText);
  const expectedLines = normaliseCode(expectedSnippet)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!expectedLines.length) {
    return false;
  }

  const matchingLineCount = expectedLines.filter((line) => normalizedActual.includes(line)).length;
  const requiredMatches = Math.min(expectedLines.length, 2);
  return matchingLineCount >= requiredMatches;
}

function validateWalkthroughLinks(steps: WalkthroughStepWithEvidence[]) {
  const stepIds = new Set(steps.map((step) => step.id));
  const subrangesByStepId = new Map(
    steps.map((step) => [step.id, new Set(step.subranges.map((subrange) => subrange.id))])
  );

  steps.forEach((step, index) => {
    const nextOrderedStep = steps[index + 1];
    if (nextOrderedStep && (!step.links || step.links.length === 0)) {
      throw new Error(`Codebase walkthrough step ${step.id} requires at least one outgoing link`);
    }

    const seenTargetIds = new Set<string>();
    for (const link of step.links ?? []) {
      if (!stepIds.has(link.stepId)) {
        throw new Error(`Codebase walkthrough step ${step.id} links to unknown step ${link.stepId}`);
      }
      if (link.subrangeId && !subrangesByStepId.get(link.stepId)?.has(link.subrangeId)) {
        throw new Error(
          `Codebase walkthrough step ${step.id} links to unknown subrange ${link.subrangeId} on ${link.stepId}`
        );
      }
      if (seenTargetIds.has(link.stepId)) {
        throw new Error(`Codebase walkthrough step ${step.id} links to ${link.stepId} more than once`);
      }
      seenTargetIds.add(link.stepId);
    }
  });
}

function validateWalkthroughBranches(steps: WalkthroughStepWithEvidence[]) {
  const stepIds = new Set(steps.map((step) => step.id));
  const subrangesByStepId = new Map(
    steps.map((step) => [step.id, new Set(step.subranges.map((subrange) => subrange.id))])
  );

  for (const step of steps) {
    const seenBranchIds = new Set<string>();
    for (const branch of step.branches ?? []) {
      if (seenBranchIds.has(branch.id)) {
        throw new Error(`Codebase walkthrough step ${step.id} contains duplicate branch id ${branch.id}`);
      }
      seenBranchIds.add(branch.id);

      if (branch.targetSubrangeId && !branch.targetStepId) {
        throw new Error(
          `Codebase walkthrough step ${step.id} branch ${branch.id} requires targetStepId when targetSubrangeId is present`
        );
      }
      if (branch.targetStepId && !stepIds.has(branch.targetStepId)) {
        throw new Error(
          `Codebase walkthrough step ${step.id} branch ${branch.id} points to unknown step ${branch.targetStepId}`
        );
      }
      if (
        branch.targetStepId &&
        branch.targetSubrangeId &&
        !subrangesByStepId.get(branch.targetStepId)?.has(branch.targetSubrangeId)
      ) {
        throw new Error(
          `Codebase walkthrough step ${step.id} branch ${branch.id} points to unknown subrange ${branch.targetSubrangeId} on ${branch.targetStepId}`
        );
      }
    }
  }
}

function validateWalkthroughFollowUps(
  session: GuidedSession,
  steps: WalkthroughStepWithEvidence[]
) {
  const stepIds = new Set(steps.map((step) => step.id));

  for (const followUp of session.followUps ?? []) {
    if (followUp.stepId && !stepIds.has(followUp.stepId)) {
      throw new Error(
        `Codebase walkthrough follow-up ${followUp.id} points to unknown step ${followUp.stepId}`
      );
    }
  }
}

function validateWalkthroughGraph(
  session: GuidedSession,
  steps: WalkthroughStepWithEvidence[]
) {
  validateWalkthroughLinks(steps);
  validateWalkthroughBranches(steps);
  validateWalkthroughFollowUps(session, steps);
}

async function validateWalkthroughFileEvidence(
  rootDir: string,
  step: WalkthroughStepWithEvidence
): Promise<void> {
  const filePath = path.join(rootDir, step.file.path);
  const fileContent = await readFile(filePath, "utf8");

  const snippetMatchesAnyRange = step.subranges.some((subrange) =>
    snippetsOverlap(getRangeEvidenceText(fileContent, subrange.range), step.snippet)
  );

  if (!snippetMatchesAnyRange) {
    throw new Error(
      `Codebase walkthrough step ${step.id} snippet must overlap one of its declared subranges`
    );
  }

  for (const subrange of step.subranges) {
    if (!subrange.snippet) {
      continue;
    }

    const rangeText = getRangeEvidenceText(fileContent, subrange.range);
    if (!snippetsOverlap(rangeText, subrange.snippet)) {
      throw new Error(
        `Codebase walkthrough step ${step.id} subrange ${subrange.id} snippet must overlap its range`
      );
    }
  }
}
