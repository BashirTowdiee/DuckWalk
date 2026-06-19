import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(__dirname, "..");
export const releaseDir = path.join(repoRoot, ".release");
export const extensionDir = path.join(repoRoot, "apps", "vscode-extension");
export const mcpServerDir = path.join(repoRoot, "apps", "mcp-server");
export const pluginDir = path.join(repoRoot, "plugins", "duckwalk");
export const repoUrl = "https://github.com/BashirTowdiee/DuckWalk";
export const githubRepoSlug = "BashirTowdiee/DuckWalk";

const semverPattern = /^\d+\.\d+\.\d+$/;

export function logStep(scriptName, message) {
  process.stdout.write(`\n[${scriptName}] ${message}\n`);
}

export function assertSemver(version) {
  if (!semverPattern.test(version)) {
    throw new Error(`Expected semver version x.y.z, received "${version}"`);
  }
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(filePath, value) {
  await writeFile(filePath, value);
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureEmptyDir(dirPath) {
  await rm(dirPath, { force: true, recursive: true });
  await ensureDir(dirPath);
}

export async function copyDirectory(sourcePath, destinationPath) {
  await cp(sourcePath, destinationPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: {
        ...process.env,
        ...options.env
      },
      shell: false,
      stdio: "inherit"
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

export async function getRootManifest() {
  return await readJson(path.join(repoRoot, "package.json"));
}

export async function getPublicVersion() {
  const manifest = await getRootManifest();
  assertSemver(manifest.version);
  return manifest.version;
}

export function getArtifactPaths(version) {
  assertSemver(version);

  return {
    codexMarketplaceDir: path.join(releaseDir, "duckwalk-codex-marketplace"),
    codexMarketplaceZip: path.join(releaseDir, `duckwalk-codex-marketplace-${version}.zip`),
    manifestPath: path.join(releaseDir, "release-manifest.json"),
    npmCacheDir: path.join(releaseDir, "npm-cache"),
    npmTarballPath: path.join(releaseDir, `duckwalk-mcp-server-${version}.tgz`),
    vsixPath: path.join(releaseDir, `duckwalk-${version}.vsix`)
  };
}

export async function listReleaseFiles() {
  const entries = await readdir(releaseDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && [".tgz", ".vsix", ".zip"].includes(path.extname(entry.name)))
    .map((entry) => path.join(releaseDir, entry.name))
    .sort();
}

export function normalizeReleaseTag(tagValue) {
  if (!tagValue) {
    return null;
  }

  return tagValue.startsWith("v") ? tagValue.slice(1) : tagValue;
}

export function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${names.join(", ")}`);
}

export function getMimeType(filePath) {
  const extension = path.extname(filePath);
  switch (extension) {
    case ".tgz":
      return "application/gzip";
    case ".vsix":
      return "application/vsix";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
