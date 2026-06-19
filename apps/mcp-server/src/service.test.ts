import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import {
  codebaseWalkthroughSession,
  createImplementationSession,
  prReviewSession,
  writeWalkthroughFixture
} from "./service.fixtures";
import {
  createGuidedSession,
  createPrReviewSession,
  getDuckWalkContract,
  getGuidedSession,
  pathfinder,
  updateStepStatus,
  validateGuidedSessionInput
} from "./service";

const implementationSession = createImplementationSession("mcp-implementation");
const secondImplementationSession = createImplementationSession("mcp-implementation-2", "step-2");

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
    expect(contract.guidance.pathfinderAuthoringHints).toHaveLength(5);
    expect(contract.examples.pathfinder.session.steps[0]?.subranges).toHaveLength(2);
    expect(contract.examples.pathfinder.session.steps[0]?.links?.[0]?.subrangeId).toBe(
      "token-validate"
    );
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
    expect(result.session.stepCount).toBe(2);
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
    await writeWalkthroughFixture(rootDir);
    const created = await pathfinder(rootDir, codebaseWalkthroughSession);
    const loaded = await getGuidedSession(rootDir, created.sessionId);

    expect(created.sessionId).toBe("mcp-walkthrough");
    expect(loaded.session.mode).toBe("codebase_walkthrough");
    expect(loaded.session.question).toBe("How does authentication work in this backend?");
    expect(loaded.session.flow?.path).toHaveLength(3);
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
          touchpoint: "entry",
          confidence: "direct",
          evidenceQuality: "high",
          fileRationale: "This file still represents the auth entrypoint, but the location is invalid.",
          file: {
            path: "src/auth/middleware.ts"
          },
          location: {
            strategy: "line",
            line: 2
          },
          subranges: [
            {
              id: "broken-primary",
              label: "Broken primary",
              role: "primary",
              range: {
                startLine: 2,
                startCharacter: 0,
                endLine: 3,
                endCharacter: 0
              }
            }
          ],
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

  it("rejects a walkthrough session when the step snippet does not overlap the declared evidence", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-walkthrough-snippet-"));
    await writeWalkthroughFixture(rootDir);

    const invalidSession: GuidedSession = {
      ...codebaseWalkthroughSession,
      id: "mcp-walkthrough-bad-snippet",
      steps: codebaseWalkthroughSession.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              snippet: "export const definitelyNotInThisRange = false;\n"
            }
          : step
      )
    };

    await expect(pathfinder(rootDir, invalidSession)).rejects.toThrow(/snippet must overlap/);
  });
});
