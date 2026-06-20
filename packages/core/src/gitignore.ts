import { readFile } from "node:fs/promises";
import path from "node:path";

export const guidedImplementationIgnoreRule = ".guided-implementation/";

const equivalentIgnoreRules = new Set([
  guidedImplementationIgnoreRule,
  ".guided-implementation",
  ".guided-implementation/*"
]);

export type GuidedImplementationGitignoreStatus = {
  path: string;
  entry: string;
  alreadyPresent: boolean;
};

export async function getGuidedImplementationGitignoreStatus(
  rootDir: string
): Promise<GuidedImplementationGitignoreStatus> {
  const gitignorePath = path.join(rootDir, ".gitignore");
  let existing = "";

  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    existing = "";
  }

  const alreadyPresent = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => equivalentIgnoreRules.has(line));

  return {
    path: gitignorePath,
    entry: guidedImplementationIgnoreRule,
    alreadyPresent
  };
}
