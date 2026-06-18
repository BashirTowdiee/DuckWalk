import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pluginName = "duckwalk";
const pluginDir = path.join(repoRoot, "plugins", pluginName);
const pluginManifestPath = path.join(pluginDir, ".codex-plugin", "plugin.json");
const pluginMcpPath = path.join(pluginDir, ".mcp.json");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

function logStep(message) {
  process.stdout.write(`\n[plugin:refresh] ${message}\n`);
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function assertExists(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} not found: ${path.relative(repoRoot, filePath)}`);
  }
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

async function validateMarketplace() {
  const marketplace = await readJson(marketplacePath);
  const pluginEntry = marketplace.plugins?.find((entry) => entry.name === pluginName);

  if (!pluginEntry) {
    throw new Error(`Marketplace entry "${pluginName}" is missing from .agents/plugins/marketplace.json`);
  }

  if (pluginEntry.source?.source !== "local") {
    throw new Error(`Marketplace entry "${pluginName}" must use a local source`);
  }

  const expectedPath = "./plugins/duckwalk";
  if (pluginEntry.source.path !== expectedPath) {
    throw new Error(
      `Marketplace entry "${pluginName}" must point to ${expectedPath}, found ${pluginEntry.source.path}`
    );
  }
}

async function validatePluginManifest() {
  const manifest = await readJson(pluginManifestPath);

  if (manifest.name !== pluginName) {
    throw new Error(`Plugin manifest name must be "${pluginName}", found "${manifest.name}"`);
  }

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Plugin manifest version is required");
  }

  if (manifest.skills !== "./skills/") {
    throw new Error(`Plugin manifest skills path must be "./skills/", found ${manifest.skills}`);
  }

  if (manifest.mcpServers !== "./.mcp.json") {
    throw new Error(`Plugin manifest mcpServers path must be "./.mcp.json", found ${manifest.mcpServers}`);
  }
}

async function validateSkillsDirectory() {
  const skillsDir = path.join(pluginDir, "skills");
  await assertExists(skillsDir, "Plugin skills directory");

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory());

  if (skillDirs.length === 0) {
    throw new Error("Plugin must include at least one skill directory");
  }

  for (const skillDir of skillDirs) {
    await assertExists(path.join(skillsDir, skillDir.name, "SKILL.md"), `Skill manifest for ${skillDir.name}`);
  }
}

async function validateMcpServer() {
  const mcpConfig = await readJson(pluginMcpPath);
  const serverEntry = mcpConfig.mcpServers?.[pluginName];

  if (!serverEntry) {
    throw new Error(`.mcp.json must define mcpServers.${pluginName}`);
  }

  if (serverEntry.command !== "node") {
    throw new Error(`mcpServers.${pluginName}.command must be "node", found "${serverEntry.command}"`);
  }

  if (!Array.isArray(serverEntry.args) || serverEntry.args.length === 0) {
    throw new Error(`mcpServers.${pluginName}.args must include the built server entrypoint`);
  }

  const serverCwd = path.resolve(pluginDir, serverEntry.cwd ?? ".");
  const serverEntrypoint = path.resolve(serverCwd, serverEntry.args[0]);
  await assertExists(serverEntrypoint, "Built MCP server entrypoint");
}

async function validatePlugin() {
  logStep("Validating local Codex plugin");
  await assertExists(pluginManifestPath, "Plugin manifest");
  await assertExists(pluginMcpPath, "Plugin MCP config");
  await assertExists(marketplacePath, "Plugin marketplace file");
  await validateMarketplace();
  await validatePluginManifest();
  await validateSkillsDirectory();
  await validateMcpServer();

  const pluginStats = await stat(pluginDir);
  if (!pluginStats.isDirectory()) {
    throw new Error(`Plugin path is not a directory: ${path.relative(repoRoot, pluginDir)}`);
  }

  process.stdout.write("[plugin:refresh] Plugin validation passed.\n");
}

async function main() {
  logStep("Building @duckwalk/mcp-server");
  await runCommand("pnpm", ["--filter", "@duckwalk/mcp-server", "build"]);
  await validatePlugin();
  process.stdout.write(
    "[plugin:refresh] Done. Reload or reinstall the local duckwalk plugin in Codex to pick up the update.\n"
  );
}

main().catch((error) => {
  process.stderr.write(`[plugin:refresh] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
