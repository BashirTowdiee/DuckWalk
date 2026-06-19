import type { GuidedSession, GuidedStep, WalkthroughSubrange } from "@duckwalk/schema";

export function getOrderedSteps(session: GuidedSession | null): GuidedStep[] {
  return [...(session?.steps ?? [])].sort((left, right) => left.order - right.order);
}

export function getActiveStep(
  session: GuidedSession | null,
  activeStepId: string | null
): GuidedStep | undefined {
  return getOrderedSteps(session).find((step) => step.id === activeStepId);
}

export function getDefaultEvidenceId(step: GuidedStep | undefined): string | null {
  if (!step || step.mode !== "codebase_walkthrough") {
    return null;
  }

  const primaryEvidence =
    step.subranges?.find((subrange) => subrange.role === "primary") ?? step.subranges?.[0];
  return primaryEvidence?.id ?? null;
}

export function getWalkthroughSubrange(
  step: GuidedStep,
  evidenceId: string | null
): WalkthroughSubrange | null {
  if (step.mode !== "codebase_walkthrough" || !evidenceId) {
    return null;
  }

  return step.subranges?.find((subrange) => subrange.id === evidenceId) ?? null;
}
