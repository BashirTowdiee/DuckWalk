import { readFile } from "node:fs/promises";
import path from "node:path";

import { normaliseCode } from "@duckwalk/core";
import type { GuidedRange, GuidedSession, GuidedStep } from "@duckwalk/schema";

import type { WalkthroughDriftState } from "./sidebar/types";

type WalkthroughStep = Extract<GuidedStep, { mode: "codebase_walkthrough" }>;

export async function inspectWalkthroughDrift(
  workspaceRoot: string,
  session: GuidedSession | null
): Promise<WalkthroughDriftState | null> {
  if (!session || session.mode !== "codebase_walkthrough") {
    return null;
  }

  const issues: string[] = [];

  for (const step of session.steps as WalkthroughStep[]) {
    const filePath = path.join(workspaceRoot, step.file.path);
    let fileContent: string;

    try {
      fileContent = await readFile(filePath, "utf8");
    } catch {
      issues.push(`${step.file.path} is missing.`);
      continue;
    }

    const subranges = step.subranges ?? [];
    const snippetMatches = subranges.some((subrange) =>
      snippetsOverlap(getRangeEvidenceText(fileContent, subrange.range), step.snippet)
    );
    if (!snippetMatches) {
      issues.push(`${step.id} snippet no longer matches its saved evidence ranges.`);
    }

    for (const subrange of subranges) {
      if (subrange.snippet && !snippetsOverlap(getRangeEvidenceText(fileContent, subrange.range), subrange.snippet)) {
        issues.push(`${step.id} evidence ${subrange.id} no longer matches its saved snippet.`);
      }

      for (const symbol of subrange.symbols ?? []) {
        if (!fileContent.includes(symbol)) {
          issues.push(`${step.id} evidence ${subrange.id} no longer contains symbol ${symbol}.`);
        }
      }
    }

    for (const symbol of step.symbols ?? []) {
      if (!fileContent.includes(symbol)) {
        issues.push(`${step.id} no longer contains symbol ${symbol}.`);
      }
    }
  }

  return {
    status: issues.length ? "stale" : "fresh",
    issues
  };
}

function getRangeEvidenceText(content: string, range: GuidedRange): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  return lines.slice(range.startLine - 1, range.endLine).join("\n");
}

function snippetsOverlap(actualRangeText: string, expectedSnippet: string): boolean {
  const normalizedActual = normaliseCode(actualRangeText);
  const expectedLines = normaliseCode(expectedSnippet)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!expectedLines.length) {
    return false;
  }

  const matchingLineCount = expectedLines.filter((line) => normalizedActual.includes(line)).length;
  const requiredMatches = Math.min(expectedLines.length, 2);
  return matchingLineCount >= requiredMatches;
}
