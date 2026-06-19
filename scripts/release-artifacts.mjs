import path from "node:path";

import {
  copyDirectory,
  ensureDir,
  ensureEmptyDir,
  extensionDir,
  fileExists,
  getArtifactPaths,
  getPublicVersion,
  listReleaseFiles,
  logStep,
  pluginDir,
  readJson,
  releaseDir,
  repoRoot,
  runCommand,
  writeText,
  writeJson
} from "./release-utils.mjs";

function createMarketplaceManifest() {
  return {
    name: "duckwalk",
    interface: {
      displayName: "duckWalk"
    },
    plugins: [
      {
        name: "duckwalk",
        source: {
          source: "local",
          path: "./plugins/duckwalk"
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Developer Tools"
      }
    ]
  };
}

async function validateCodexMarketplaceBundle(bundleRoot, version) {
  const marketplacePath = path.join(bundleRoot, "marketplace.json");
  const pluginManifestPath = path.join(bundleRoot, "plugins", "duckwalk", ".codex-plugin", "plugin.json");
  const pluginMcpPath = path.join(bundleRoot, "plugins", "duckwalk", ".mcp.json");

  const marketplace = await readJson(marketplacePath);
  if (marketplace.name !== "duckwalk") {
    throw new Error(`Expected marketplace name "duckwalk", found "${marketplace.name}"`);
  }

  const pluginEntry = marketplace.plugins?.find((entry) => entry.name === "duckwalk");
  if (!pluginEntry) {
    throw new Error("Marketplace bundle is missing the duckwalk plugin entry");
  }

  if (pluginEntry.source?.path !== "./plugins/duckwalk") {
    throw new Error(`Marketplace bundle must point to ./plugins/duckwalk, found ${pluginEntry.source?.path}`);
  }

  const pluginManifest = await readJson(pluginManifestPath);
  if (pluginManifest.version !== version) {
    throw new Error(`Expected bundled plugin version ${version}, found ${pluginManifest.version}`);
  }

  const pluginMcp = await readJson(pluginMcpPath);
  const duckwalkServer = pluginMcp.mcpServers?.duckwalk;
  if (!duckwalkServer) {
    throw new Error("Bundled plugin is missing mcpServers.duckwalk");
  }

  if (duckwalkServer.command !== "npx") {
    throw new Error(`Expected bundled MCP command "npx", found "${duckwalkServer.command}"`);
  }

  const expectedArgs = ["-y", "@duckwalk/mcp-server"];
  if (JSON.stringify(duckwalkServer.args) !== JSON.stringify(expectedArgs)) {
    throw new Error(`Expected bundled MCP args ${JSON.stringify(expectedArgs)}, found ${JSON.stringify(duckwalkServer.args)}`);
  }
}

async function buildCodexMarketplaceBundle(version) {
  const artifacts = getArtifactPaths(version);
  const pluginBundleDir = path.join(artifacts.codexMarketplaceDir, "plugins", "duckwalk");
  const pluginMcpPath = path.join(pluginBundleDir, ".mcp.json");

  await ensureDir(path.dirname(pluginBundleDir));
  await copyDirectory(pluginDir, pluginBundleDir);

  await writeJson(path.join(artifacts.codexMarketplaceDir, "marketplace.json"), createMarketplaceManifest());
  await writeText(
    path.join(artifacts.codexMarketplaceDir, "README.md"),
    `# duckWalk Codex Marketplace Bundle

This folder is the self-serve Codex marketplace bundle for duckWalk ${version}.

## Install

1. Make sure Node.js and npm are available on this machine.
2. Add this marketplace root to Codex:

\`\`\`bash
codex plugin marketplace add /absolute/path/to/duckwalk-codex-marketplace
\`\`\`

3. Install the plugin:

\`\`\`bash
codex plugin add duckwalk@duckwalk
\`\`\`

## MCP runtime

The bundled plugin starts the MCP server through:

\`\`\`txt
npx -y @duckwalk/mcp-server
\`\`\`
`
  );

  await writeJson(pluginMcpPath, {
    mcpServers: {
      duckwalk: {
        command: "npx",
        args: ["-y", "@duckwalk/mcp-server"]
      }
    }
  });

  await validateCodexMarketplaceBundle(artifacts.codexMarketplaceDir, version);

  await runCommand(
    "zip",
    ["-qr", path.basename(artifacts.codexMarketplaceZip), path.basename(artifacts.codexMarketplaceDir)],
    { cwd: releaseDir }
  );

  return artifacts.codexMarketplaceZip;
}

async function buildVsix(version) {
  const artifacts = getArtifactPaths(version);
  await runCommand(
    "pnpm",
    ["dlx", "@vscode/vsce", "package", "-o", path.relative(extensionDir, artifacts.vsixPath)],
    { cwd: extensionDir }
  );

  return artifacts.vsixPath;
}

async function buildMcpTarball() {
  await runCommand("pnpm", ["pack", "--pack-destination", "../../.release"], {
    cwd: path.join(repoRoot, "apps", "mcp-server")
  });
}

async function main() {
  const scriptName = "release:artifacts";
  const skipBuild = process.argv.includes("--skip-build");
  const version = await getPublicVersion();
  const artifacts = getArtifactPaths(version);

  logStep(scriptName, `Preparing release artifacts for ${version}`);
  await ensureEmptyDir(releaseDir);

  if (!skipBuild) {
    logStep(scriptName, "Running workspace build");
    await runCommand("pnpm", ["build"]);
  }

  logStep(scriptName, "Packing npm artifact");
  await buildMcpTarball();

  logStep(scriptName, "Packaging VS Code extension");
  await buildVsix(version);

  logStep(scriptName, "Building Codex marketplace bundle");
  await buildCodexMarketplaceBundle(version);

  const releaseFiles = await listReleaseFiles();
  const expectedExtensions = [".tgz", ".vsix", ".zip"];
  if (releaseFiles.length !== expectedExtensions.length) {
    throw new Error(`Expected exactly ${expectedExtensions.length} release artifacts, found ${releaseFiles.length}`);
  }

  for (const extension of expectedExtensions) {
    const matchingFile = releaseFiles.find((filePath) => filePath.endsWith(extension));
    if (!matchingFile) {
      throw new Error(`Expected a ${extension} artifact in ${path.relative(repoRoot, releaseDir)}`);
    }
  }

  for (const filePath of [artifacts.vsixPath, artifacts.codexMarketplaceZip]) {
    if (!(await fileExists(filePath))) {
      throw new Error(`Expected release artifact to exist: ${path.relative(repoRoot, filePath)}`);
    }
  }

  await writeJson(artifacts.manifestPath, {
    version,
    files: releaseFiles.map((filePath) => path.relative(repoRoot, filePath))
  });

  process.stdout.write("[release:artifacts] Release artifacts are ready in .release/.\n");
}

main().catch((error) => {
  process.stderr.write(`[release:artifacts] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
