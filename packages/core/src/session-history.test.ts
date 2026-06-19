import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import { writeRecipeFiles } from "./recipe-writer";
import { listGuidedSessions, switchGuidedSession } from "./session-history";
import { updateGuidedStepStatus } from "./state";

const implementationSession: GuidedSession = {
  id: "history-implementation",
  mode: "implementation",
  title: "Implementation history",
  summary: "Tracks an implementation session in history.",
  createdAt: "2026-06-19T01:00:00.000Z",
  steps: [
    {
      id: "impl-step-1",
      order: 1,
      mode: "implementation",
      file: { path: "src/auth.ts", createIfMissing: true },
      location: { strategy: "create_file" },
      explanation: {
        title: "Create auth helper",
        what: "Adds a helper.",
        why: "Used by callers."
      },
      ghostCode: "export const auth = true;\n"
    }
  ]
};

const walkthroughSession: GuidedSession = {
  id: "history-walkthrough",
  mode: "codebase_walkthrough",
  title: "Authentication walkthrough",
  summary: "Explains the auth flow.",
  question: "How does authentication work?",
  lens: "permission_flow",
  flow: {
    summary: "Request -> middleware -> service",
    path: ["Request", "authMiddleware", "resolveAuthenticatedUser"]
  },
  createdAt: "2026-06-19T02:00:00.000Z",
  steps: [
    {
      id: "walk-step-1",
      order: 1,
      mode: "codebase_walkthrough",
      touchpoint: "guard",
      confidence: "direct",
      evidenceQuality: "high",
      fileRationale: "This middleware is the request entrypoint.",
      file: { path: "src/auth/middleware.ts" },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 3,
          endCharacter: 1
        }
      },
      subranges: [
        {
          id: "walk-primary",
          label: "Auth middleware",
          role: "primary",
          range: {
            startLine: 1,
            startCharacter: 0,
            endLine: 3,
            endCharacter: 1
          },
          snippet:
            "export function authMiddleware(request) {\n  return request.headers.authorization;\n}\n"
        }
      ],
      explanation: {
        title: "Inspect auth middleware",
        what: "Reads the auth header.",
        why: "The request needs identity before it reaches handlers.",
        how: "The middleware pulls the token from the incoming request."
      },
      snippet:
        "export function authMiddleware(request) {\n  return request.headers.authorization;\n}\n"
    }
  ]
};

describe("guided session history", () => {
  it("lists archived sessions with mode and pending or complete status", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-history-"));

    await writeRecipeFiles(rootDir, implementationSession);
    await updateGuidedStepStatus(rootDir, implementationSession, "impl-step-1", "complete");
    await writeRecipeFiles(rootDir, walkthroughSession);

    const entries = await listGuidedSessions(rootDir);
    const implementation = entries.find((entry) => entry.id === implementationSession.id);
    const walkthrough = entries.find((entry) => entry.id === walkthroughSession.id);

    expect(entries[0]?.id).toBe(walkthroughSession.id);
    expect(walkthrough?.mode).toBe("codebase_walkthrough");
    expect(walkthrough?.status).toBe("pending");
    expect(implementation?.mode).toBe("implementation");
    expect(implementation?.status).toBe("complete");
    expect(implementation?.completedStepCount).toBe(1);
    expect(walkthrough?.isCurrent).toBe(true);
  });

  it("switches the current session back to a historical session and restores its state", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-history-switch-"));

    await writeRecipeFiles(rootDir, implementationSession);
    await updateGuidedStepStatus(rootDir, implementationSession, "impl-step-1", "complete");
    await writeRecipeFiles(rootDir, walkthroughSession);

    const switched = await switchGuidedSession(rootDir, implementationSession.id);
    const currentRecipe = await readFile(
      path.join(rootDir, ".guided-implementation", "current.recipe.json"),
      "utf8"
    );
    const currentState = await readFile(
      path.join(rootDir, ".guided-implementation", "state.json"),
      "utf8"
    );

    expect(switched.session.id).toBe(implementationSession.id);
    expect(switched.state.steps["impl-step-1"]?.status).toBe("complete");
    expect(currentRecipe).toContain('"id": "history-implementation"');
    expect(currentState).toContain('"sessionId": "history-implementation"');
    expect(currentState).toContain('"status": "complete"');
  });
});
