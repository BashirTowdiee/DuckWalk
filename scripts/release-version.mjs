import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { assertSemver, logStep, pluginDir, repoRoot } from "./release-utils.mjs";

const packageJsonPaths = [
  path.join(repoRoot, "package.json"),
  path.join(repoRoot, "apps", "mcp-server", "package.json"),
  path.join(repoRoot, "apps", "vscode-extension", "package.json"),
  path.join(pluginDir, ".codex-plugin", "plugin.json")
];

const versionLiteralPaths = [
  path.join(repoRoot, "apps", "mcp-server", "src", "server.ts"),
  path.join(repoRoot, "apps", "mcp-server", "src", "contract.ts")
];

async function updatePackageVersion(filePath, nextVersion) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  parsed.version = nextVersion;
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function updateSourceLiteral(filePath, nextVersion) {
  const raw = await readFile(filePath, "utf8");
  const updated = raw.replace(/version:\s*"[^"]+"/, `version: "${nextVersion}"`);
  await writeFile(filePath, updated);
}

async function main() {
  const nextVersion = process.argv[2];
  if (!nextVersion) {
    throw new Error("Usage: pnpm release:version <x.y.z>");
  }

  assertSemver(nextVersion);
  logStep("release:version", `Updating release version to ${nextVersion}`);

  for (const filePath of packageJsonPaths) {
    await updatePackageVersion(filePath, nextVersion);
  }

  for (const filePath of versionLiteralPaths) {
    await updateSourceLiteral(filePath, nextVersion);
  }

  process.stdout.write(`[release:version] Done. Release version is now ${nextVersion}.\n`);
}

main().catch((error) => {
  process.stderr.write(`[release:version] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
