import type { GuidedSession } from "@guidedpatch/schema";

export function getOrderedSteps(session: GuidedSession) {
  return [...session.steps].sort((left, right) => left.order - right.order);
}

export function validateDuplicateStepIds(session: GuidedSession) {
  const seen = new Set<string>();

  for (const step of session.steps) {
    if (seen.has(step.id)) {
      throw new Error(`Duplicate step ID detected: ${step.id}`);
    }
    seen.add(step.id);
  }
}

export function validateSessionOrder(session: GuidedSession) {
  const ordered = getOrderedSteps(session);

  ordered.forEach((step, index) => {
    const expectedOrder = index + 1;
    if (step.order !== expectedOrder) {
      throw new Error(
        `Invalid step ordering. Expected step ${step.id} to have order ${expectedOrder}, received ${step.order}`
      );
    }
  });
}

export function validateSessionIntegrity(session: GuidedSession) {
  validateDuplicateStepIds(session);
  validateSessionOrder(session);
}
