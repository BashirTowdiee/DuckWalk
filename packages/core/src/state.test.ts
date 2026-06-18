import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import {
  createInitialSessionState,
  reopenGuidedStep,
  undoGuidedStepCompletion,
  updateGuidedStepStatus
} from "./state";

const session: GuidedSession = {
  id: "state-session",
  mode: "implementation",
  title: "State session",
  summary: "Exercises state transitions.",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "step-1",
      order: 1,
      mode: "implementation",
      file: { path: "src/one.ts", createIfMissing: true },
      location: { strategy: "create_file" },
      explanation: { title: "One", what: "One", why: "One" },
      ghostCode: "export const one = 1;\n"
    },
    {
      id: "step-2",
      order: 2,
      mode: "implementation",
      file: { path: "src/two.ts", createIfMissing: true },
      location: { strategy: "create_file" },
      explanation: { title: "Two", what: "Two", why: "Two" },
      ghostCode: "export const two = 2;\n"
    }
  ]
};

describe("guided state transitions", () => {
  it("starts with the first step active", () => {
    const state = createInitialSessionState(session);

    expect(state.activeStepId).toBe("step-1");
    expect(state.steps["step-1"]?.status).toBe("active");
    expect(state.steps["step-2"]?.status).toBe("pending");
  });

  it("undoes a completed step by reopening it and resetting later steps", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-state-"));

    await updateGuidedStepStatus(rootDir, session, "step-1", "complete");
    const state = await undoGuidedStepCompletion(rootDir, session, "step-1");

    expect(state.activeStepId).toBe("step-1");
    expect(state.activeStepOrder).toBe(1);
    expect(state.steps["step-1"]?.status).toBe("active");
    expect(state.steps["step-2"]?.status).toBe("pending");
  });

  it("reopens only the selected step without clearing later completed steps", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-state-"));

    await updateGuidedStepStatus(rootDir, session, "step-1", "complete");
    await updateGuidedStepStatus(rootDir, session, "step-2", "complete");
    const state = await reopenGuidedStep(rootDir, session, "step-1");

    expect(state.activeStepId).toBe("step-1");
    expect(state.activeStepOrder).toBe(1);
    expect(state.steps["step-1"]?.status).toBe("active");
    expect(state.steps["step-2"]?.status).toBe("complete");
  });
});
