import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const rootManifestPath = path.join(repoRoot, "package.json");

function logStep(message) {
  process.stdout.write(`\n[plugin:bump] ${message}\n`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

function bumpBaseVersion(baseVersion, bumpType) {
  const match = semverPattern.exec(baseVersion);
  if (!match) {
    throw new Error(`Invalid base semver version: ${baseVersion}`);
  }

  const [, majorText, minorText, patchText] = match;
  let major = Number(majorText);
  let minor = Number(minorText);
  let patch = Number(patchText);

  switch (bumpType) {
    case "major":
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor += 1;
      patch = 0;
      break;
    case "patch":
      patch += 1;
      break;
    default:
      throw new Error(`Unsupported bump type: ${bumpType}`);
  }

  return `${major}.${minor}.${patch}`;
}

function resolveNextVersion(currentVersion, requestedValue) {
  if (!semverPattern.test(currentVersion)) {
    throw new Error(`Unsupported root version format: ${currentVersion}. Expected plain semver x.y.z.`);
  }

  return semverPattern.test(requestedValue) ? requestedValue : bumpBaseVersion(currentVersion, requestedValue);
}

async function main() {
  const requestedValue = process.argv[2];
  if (!requestedValue) {
    throw new Error("Usage: pnpm plugin:bump <patch|minor|major|x.y.z>");
  }

  if (!["patch", "minor", "major"].includes(requestedValue) && !semverPattern.test(requestedValue)) {
    throw new Error("Expected patch, minor, major, or an explicit semver like 0.2.0");
  }

  const rawManifest = await readFile(rootManifestPath, "utf8");
  const manifest = JSON.parse(rawManifest);
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Root package version is required");
  }

  const nextVersion = resolveNextVersion(manifest.version, requestedValue);
  logStep(`Updating canonical release version to ${nextVersion}`);
  await runCommand("pnpm", ["release:version", nextVersion]);

  logStep("Running plugin:refresh");
  await runCommand("pnpm", ["plugin:refresh"]);
  process.stdout.write(`[plugin:bump] Done. Canonical release version now uses ${nextVersion}.\n`);
}

main().catch((error) => {
  process.stderr.write(`[plugin:bump] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
