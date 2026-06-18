import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import {
  createGuidedSession,
  createPrReviewSession,
  getDuckWalkContract,
  getGuidedSession,
  pathfinder,
  updateStepStatus,
  validateGuidedSessionInput
} from "./service";

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

const codebaseWalkthroughSession: GuidedSession = {
  id: "mcp-walkthrough",
  mode: "codebase_walkthrough",
  title: "Trace backend authentication flow",
  summary: "Explains how authentication moves from middleware into token validation.",
  question: "How does authentication work in this backend?",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "walk-step-1",
      order: 1,
      mode: "codebase_walkthrough",
      file: {
        path: "src/auth/middleware.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 6,
          endCharacter: 0
        }
      },
      explanation: {
        title: "Start in the auth middleware",
        what: "The middleware reads the bearer token from the incoming request.",
        why: "Every protected route enters the auth flow at this touchpoint.",
        how: "The authorization header is parsed and its token is passed into the auth service.",
        impact: "Missing tokens fail before route handlers execute."
      },
      snippet:
        "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n"
    }
  ]
};

describe("duckWalk MCP service", () => {
  it("creates and reads an implementation session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-mcp-"));
    const created = await createGuidedSession(rootDir, implementationSession);
    const loaded = await getGuidedSession(rootDir, created.sessionId);

    expect(created.sessionId).toBe("mcp-implementation");
    expect(loaded.session.steps).toHaveLength(1);
  });

  it("returns a contract payload with examples and workspace guidance", () => {
    const contract = getDuckWalkContract();

    expect(contract.tools.get_duckwalk_contract.description).toMatch(/contract/i);
    expect(contract.guidance.workspaceRoot).toMatch(/workspaceRoot/);
    expect(contract.guidance.commentStyle).toMatch(/ghostCode/);
    expect(contract.guidance.commentStyle).toMatch(/Important/);
    expect(contract.tools.pathfinder.description).toMatch(/codebase walkthrough/i);
    expect(contract.examples.create_guided_session.workspaceRoot).toMatch(/absolute\/path/);
    expect(contract.examples.pathfinder.session.question).toMatch(/authentication work/);
    expect(contract.examples.create_guided_session.session.steps[0]?.ghostCode).toMatch(
      /Rejects unauthenticated requests/
    );
  });

  it("validates a guided session payload without writing files", () => {
    const result = validateGuidedSessionInput({
      session: implementationSession,
      expectMode: "implementation"
    });

    expect(result.valid).toBe(true);
    expect(result.session.mode).toBe("implementation");
    expect(result.session.stepCount).toBe(1);
  });

  it("validates a codebase walkthrough payload without writing files", () => {
    const result = validateGuidedSessionInput({
      session: codebaseWalkthroughSession,
      expectMode: "codebase_walkthrough"
    });

    expect(result.valid).toBe(true);
    expect(result.session.mode).toBe("codebase_walkthrough");
    expect(result.session.stepCount).toBe(1);
  });

  it("writes guided artifacts into the provided target workspace root", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-root-target-"));
    const created = await createGuidedSession(rootDir, implementationSession);
    const gitignore = await readFile(path.join(rootDir, ".gitignore"), "utf8");

    expect(created.recipePath).toContain(rootDir);
    expect(created.markdownPath).toContain(rootDir);
    expect(created.statePath).toContain(rootDir);
    expect(gitignore).toContain(".guided-implementation/");
  });

  it("updates step status", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-status-"));
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
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-session-state-"));
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
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-review-error-"));

    await expect(createPrReviewSession(rootDir, implementationSession)).rejects.toThrow(
      /requires mode "pr_review"/
    );
  });

  it("creates a pr review session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-review-"));
    const created = await createPrReviewSession(rootDir, prReviewSession);

    expect(created.sessionId).toBe("mcp-review");
  });

  it("creates a pathfinder walkthrough session", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-pathfinder-"));
    const created = await pathfinder(rootDir, codebaseWalkthroughSession);
    const loaded = await getGuidedSession(rootDir, created.sessionId);

    expect(created.sessionId).toBe("mcp-walkthrough");
    expect(loaded.session.mode).toBe("codebase_walkthrough");
    expect(loaded.session.question).toBe("How does authentication work in this backend?");
  });

  it("rejects a pr review session without a range target", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-review-range-"));
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

  it("rejects validateGuidedSessionInput when the expected mode is wrong", () => {
    expect(() =>
      validateGuidedSessionInput({
        session: implementationSession,
        expectMode: "pr_review"
      })
    ).toThrow(/Expected session mode "pr_review"/);
  });

  it("rejects a walkthrough session without a range target", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-walkthrough-range-"));
    const invalidSession: GuidedSession = {
      ...codebaseWalkthroughSession,
      id: "mcp-walkthrough-invalid",
      steps: [
        {
          id: "walk-step-invalid",
          order: 1,
          mode: "codebase_walkthrough",
          file: {
            path: "src/auth/middleware.ts"
          },
          location: {
            strategy: "line",
            line: 2
          },
          explanation: {
            title: "Broken walkthrough step",
            what: "Shows the auth middleware.",
            why: "The walkthrough still needs a valid location.",
            how: "This version omits the required range."
          },
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n"
        }
      ]
    };

    await expect(pathfinder(rootDir, invalidSession)).rejects.toThrow(/location range/);
  });
});
