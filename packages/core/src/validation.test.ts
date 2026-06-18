import { describe, expect, it } from "vitest";

import type { GuidedStep } from "@duckwalk/schema";

import { normaliseCode, validateStepAgainstContent } from "./validation";

const step: GuidedStep = {
  id: "step-1",
  order: 1,
  mode: "implementation",
  file: {
    path: "src/example.ts"
  },
  location: {
    strategy: "create_file"
  },
  explanation: {
    title: "Add function",
    what: "Creates a function.",
    why: "Needed by the feature."
  },
  ghostCode: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
  validation: {
    type: "normalised_match"
  }
};

describe("normaliseCode", () => {
  it("normalises line endings and trailing whitespace", () => {
    expect(normaliseCode("a  \r\nb\r\n")).toBe("a\nb");
  });
});

describe("validateStepAgainstContent", () => {
  it("matches equivalent text", () => {
    expect(
      validateStepAgainstContent(
        step,
        "const unused = true;\n\nexport function add(a: number, b: number) {\n  return a + b;\n}\n"
      )
    ).toBe(true);
  });

  it("rejects missing text", () => {
    expect(validateStepAgainstContent(step, "export const nope = false;\n")).toBe(false);
  });
});
