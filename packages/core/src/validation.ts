import type { GuidedLocation, GuidedStep, StepValidation } from "@guidedpatch/schema";

export function normaliseCode(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function getLineSlice(content: string, startLine: number, endLine: number): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function getValidationText(step: GuidedStep): string {
  if (step.validation?.expectedText) {
    return step.validation.expectedText;
  }

  if (step.mode === "implementation") {
    return step.ghostCode;
  }

  return step.review.afterCode ?? step.review.beforeCode ?? "";
}

export function extractValidationWindow(
  content: string,
  location: GuidedLocation,
  validation?: StepValidation
): string {
  if (validation?.scope !== "range") {
    return content;
  }

  if (location.strategy === "range" && location.range) {
    return getLineSlice(content, location.range.startLine, location.range.endLine);
  }

  if (location.strategy === "line" && location.line) {
    const expectedLines = validation.expectedText
      ? normaliseCode(validation.expectedText).split("\n").length
      : 1;
    return getLineSlice(content, location.line, location.line + expectedLines - 1);
  }

  return content;
}

export function validateExpectedCode(actual: string, expected: string): boolean {
  if (!expected.trim()) {
    return false;
  }

  return normaliseCode(actual).includes(normaliseCode(expected));
}

export function validateStepAgainstContent(step: GuidedStep, content: string): boolean {
  const expectedText = getValidationText(step);
  const validationWindow = extractValidationWindow(content, step.location, step.validation);
  return validateExpectedCode(validationWindow, expectedText);
}
