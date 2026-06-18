import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@guidedpatch/schema";

import { validateSessionIntegrity } from "./session";

const baseSession: GuidedSession = {
  id: "session-1",
  mode: "implementation",
  title: "Test session",
  summary: "A test session.",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "step-1",
      order: 1,
      mode: "implementation",
      file: {
        path: "src/a.ts",
        createIfMissing: true
      },
      location: {
        strategy: "create_file"
      },
      explanation: {
        title: "Create file",
        what: "Adds the file.",
        why: "Needed for the feature."
      },
      ghostCode: "export const a = 1;\n"
    }
  ]
};

const baseStep = baseSession.steps[0]!;

describe("validateSessionIntegrity", () => {
  it("accepts a sequential session", () => {
    expect(() => validateSessionIntegrity(baseSession)).not.toThrow();
  });

  it("rejects duplicate step IDs", () => {
    expect(() =>
      validateSessionIntegrity({
        ...baseSession,
        steps: [
          baseStep,
          {
            ...baseStep,
            order: 2
          }
        ]
      })
    ).toThrow(/Duplicate step ID/);
  });

  it("rejects gaps in ordering", () => {
    expect(() =>
      validateSessionIntegrity({
        ...baseSession,
        steps: [
          baseStep,
          {
            ...baseStep,
            id: "step-2",
            order: 3
          }
        ]
      })
    ).toThrow(/Invalid step ordering/);
  });
});
