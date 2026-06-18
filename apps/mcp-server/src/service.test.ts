import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@guidedpatch/schema";

import { createGuidedSession, createPrReviewSession, getGuidedSession, updateStepStatus } from "./service";

function createImplementationSession(id: string, stepId = "step-1"): GuidedSession {
  return {
    id,
    mode: "implementation",
    title: "Implementation recipe",
    summary: "Creates a source file.",
    createdAt: "2026-06-18T00:00:00.000Z",
    steps: [
      {
        id: stepId,
        order: 1,
        mode: "implementation",
        file: {
          path: `src/${id}.ts`,
          createIfMissing: true
        },
        location: {
          strategy: "create_file"
        },
        explanation: {
          title: "Create feature file",
          what: "Adds the feature file.",
          why: "The feature starts here."
        },
        ghostCode: `export const ${id.replace(/-/g, "_")} = true;\n`,
        validation: {
          type: "normalised_match"
        }
      }
    ]
  };
}

const implementationSession = createImplementationSession("mcp-implementation");
const secondImplementationSession = createImplementationSession("mcp-implementation-2", "step-2");

const prReviewSession: GuidedSession = {
  id: "mcp-review",
  mode: "pr_review",
  title: "PR review recipe",
  summary: "Walks through a diff.",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "review-step-1",
      order: 1,
      mode: "pr_review",
      file: {
        path: "src/feature.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 3,
          endCharacter: 0
        }
      },
      explanation: {
        title: "Review feature change",
        what: "Adds the feature export.",
        why: "Needed for downstream imports.",
        impact: "The symbol is now public."
      },
      review: {
        beforeCode: "",
        afterCode: "export const feature = true;\n",
        changedRange: {
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 28
        }
      }
    }
  ]
};

describe("GuidedPatch MCP service", () => {
  it("creates and reads an implementation session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-mcp-"));
    const created = await createGuidedSession(rootDir, implementationSession);
    const loaded = await getGuidedSession(rootDir, created.sessionId);

    expect(created.sessionId).toBe("mcp-implementation");
    expect(loaded.session.steps).toHaveLength(1);
  });

  it("updates step status", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-status-"));
    await createGuidedSession(rootDir, implementationSession);
    const updated = await updateStepStatus(rootDir, {
      sessionId: implementationSession.id,
      stepId: "step-1",
      status: "complete"
    });

    expect(updated.status).toBe("complete");
    expect(updated.state.steps["step-1"]?.status).toBe("complete");
    expect(updated.state.activeStepId).toBeNull();
  });

  it("keeps per-session state isolated from the current session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-session-state-"));
    await createGuidedSession(rootDir, implementationSession);
    await createGuidedSession(rootDir, secondImplementationSession);

    await updateStepStatus(rootDir, {
      sessionId: implementationSession.id,
      stepId: "step-1",
      status: "complete"
    });

    const currentSession = await getGuidedSession(rootDir, secondImplementationSession.id);
    const historicalSession = await getGuidedSession(rootDir, implementationSession.id);

    expect(currentSession.state?.sessionId).toBe(secondImplementationSession.id);
    expect(currentSession.state?.steps["step-2"]?.status).toBe("active");
    expect(historicalSession.state?.sessionId).toBe(implementationSession.id);
    expect(historicalSession.state?.steps["step-1"]?.status).toBe("complete");
    expect(historicalSession.state?.activeStepId).toBeNull();
  });

  it("rejects non-review sessions for createPrReviewSession", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-review-error-"));

    await expect(createPrReviewSession(rootDir, implementationSession)).rejects.toThrow(
      /requires mode "pr_review"/
    );
  });

  it("creates a pr review session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-review-"));
    const created = await createPrReviewSession(rootDir, prReviewSession);

    expect(created.sessionId).toBe("mcp-review");
  });

  it("rejects a pr review session without a range target", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "guidedpatch-review-range-"));
    const invalidSession: GuidedSession = {
      ...prReviewSession,
      id: "mcp-review-invalid",
      steps: [
        {
          id: "review-step-invalid",
          order: 1,
          mode: "pr_review",
          file: {
            path: "src/feature.ts"
          },
          location: {
            strategy: "create_file"
          },
          explanation: {
            title: "Review feature change",
            what: "Adds the feature export.",
            why: "Needed for downstream imports."
          },
          review: {
            afterCode: "export const feature = true;\n"
          }
        }
      ]
    };

    await expect(createPrReviewSession(rootDir, invalidSession)).rejects.toThrow(
      /requires a location range or review\.changedRange/
    );
  });
});
