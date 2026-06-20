import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import { writeRecipeFiles } from "./recipe-writer";

const session: GuidedSession = {
  id: "recipe-session",
  mode: "implementation",
  title: "Recipe session",
  summary: "Writes recipe files.",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "step-1",
      order: 1,
      mode: "implementation",
      file: {
        path: "src/file.ts",
        createIfMissing: true
      },
      location: {
        strategy: "create_file"
      },
      explanation: {
        title: "Create file",
        what: "Creates the file.",
        why: "Needed for the test."
      },
      ghostCode: "export const file = true;\n"
    }
  ]
};

describe("writeRecipeFiles", () => {
  it("writes recipe JSON and markdown", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-recipe-"));
    const result = await writeRecipeFiles(rootDir, session);

    const recipe = await readFile(result.recipePath, "utf8");
    const markdown = await readFile(result.markdownPath, "utf8");

    expect(recipe).toContain('"id": "recipe-session"');
    expect(markdown).toContain("# Recipe session");
  });

  it("does not create a .gitignore file as a side effect", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-recipe-ignore-"));
    await writeRecipeFiles(rootDir, session);

    await expect(readFile(path.join(rootDir, ".gitignore"), "utf8")).rejects.toThrow();
  });

  it("preserves an existing .gitignore file unchanged", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "duckwalk-recipe-ignore-idempotent-"));
    const gitignorePath = path.join(rootDir, ".gitignore");
    const originalGitignore = "dist\n.env\n";

    await writeFile(gitignorePath, originalGitignore);
    await writeRecipeFiles(rootDir, session);

    const gitignore = await readFile(gitignorePath, "utf8");

    expect(gitignore).toBe(originalGitignore);
  });
});
