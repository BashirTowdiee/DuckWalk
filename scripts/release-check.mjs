import { getArtifactPaths, getPublicVersion, logStep, runCommand } from "./release-utils.mjs";

async function main() {
  const scriptName = "release:check";
  const version = await getPublicVersion();
  const artifacts = getArtifactPaths(version);

  logStep(scriptName, "Running lint");
  await runCommand("pnpm", ["lint"]);

  logStep(scriptName, "Running typecheck");
  await runCommand("pnpm", ["typecheck"]);

  logStep(scriptName, "Running tests");
  await runCommand("pnpm", ["test"]);

  logStep(scriptName, "Running build");
  await runCommand("pnpm", ["build"]);

  logStep(scriptName, "Building release artifacts");
  await runCommand("pnpm", ["release:artifacts", "--skip-build"]);

  logStep(scriptName, "Running npm publish dry-run against packaged tarball");
  await runCommand(
    "pnpm",
    ["publish", artifacts.npmTarballPath, "--dry-run", "--no-git-checks"],
    {
      env: {
        npm_config_cache: artifacts.npmCacheDir
      }
    }
  );

  process.stdout.write("[release:check] All release verification steps passed.\n");
}

main().catch((error) => {
  process.stderr.write(`[release:check] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
