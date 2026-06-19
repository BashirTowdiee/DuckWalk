import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  extensionDir,
  getArtifactPaths,
  getMimeType,
  getPublicVersion,
  githubRepoSlug,
  listReleaseFiles,
  logStep,
  normalizeReleaseTag,
  releaseDir,
  repoRoot,
  requireEnv,
  runCommand
} from "./release-utils.mjs";

function isDryRun() {
  return process.argv.includes("--dry-run");
}

function assertTagMatchesVersion(version) {
  const tagValue = normalizeReleaseTag(process.env.GITHUB_REF_NAME ?? process.env.RELEASE_TAG ?? null);
  if (tagValue && tagValue !== version) {
    throw new Error(`Release tag ${tagValue} does not match package version ${version}`);
  }

  return tagValue ? `v${tagValue}` : `v${version}`;
}

async function publishNpmPackage(scriptName, tarballPath, dryRun) {
  if (!dryRun) {
    requireEnv("NODE_AUTH_TOKEN", "NPM_TOKEN");
  }
  logStep(scriptName, "Publishing npm package");
  const version = await getPublicVersion();
  const artifacts = getArtifactPaths(version);
  const args = ["publish", tarballPath, "--access", "public", "--no-git-checks"];
  if (dryRun) {
    args.push("--dry-run");
  }

  await runCommand("pnpm", args, {
    cwd: repoRoot,
    env: {
      npm_config_cache: artifacts.npmCacheDir
    }
  });
}

async function publishVsCodeExtension(scriptName, vsixPath, dryRun) {
  if (dryRun) {
    logStep(scriptName, `Dry-run: would publish VS Code Marketplace artifact ${path.basename(vsixPath)}`);
    return;
  }

  const vscePat = requireEnv("VSCE_PAT");
  logStep(scriptName, "Publishing VS Code Marketplace extension");
  await runCommand("pnpm", ["dlx", "@vscode/vsce", "publish", "-p", vscePat, "-i", vsixPath], {
    cwd: extensionDir
  });
}

async function publishOpenVsx(scriptName, vsixPath, dryRun) {
  if (dryRun) {
    logStep(scriptName, `Dry-run: would publish Open VSX artifact ${path.basename(vsixPath)}`);
    return;
  }

  const ovsxToken = requireEnv("OVSX_TOKEN");
  logStep(scriptName, "Publishing Open VSX extension");
  await runCommand("pnpm", ["dlx", "ovsx", "publish", vsixPath, "-p", ovsxToken], {
    cwd: repoRoot
  });
}

async function githubRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "duckwalk-release-script",
      ...options.headers
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  return await response.text();
}

async function getOrCreateGitHubRelease(scriptName, token, tagName) {
  const baseUrl = `https://api.github.com/repos/${githubRepoSlug}`;
  const existingRelease = await githubRequest(token, `${baseUrl}/releases/tags/${tagName}`);
  if (existingRelease) {
    logStep(scriptName, `Updating existing GitHub release ${tagName}`);
    return existingRelease;
  }

  logStep(scriptName, `Creating GitHub release ${tagName}`);
  return await githubRequest(token, `${baseUrl}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: tagName,
      name: tagName,
      generate_release_notes: true
    }),
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function uploadReleaseAsset(token, uploadUrlTemplate, filePath) {
  const assetName = path.basename(filePath);
  const uploadUrl = uploadUrlTemplate.replace("{?name,label}", `?name=${encodeURIComponent(assetName)}`);
  const assetBody = await readFile(filePath);

  await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Length": String(assetBody.length),
      "Content-Type": getMimeType(filePath),
      "User-Agent": "duckwalk-release-script"
    },
    body: assetBody
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`GitHub asset upload failed (${response.status} ${response.statusText}) for ${assetName}`);
    }
  });
}

async function deleteExistingAssetIfNeeded(token, release, filePath) {
  const assetName = path.basename(filePath);
  const existingAsset = release.assets?.find((asset) => asset.name === assetName);
  if (!existingAsset) {
    return;
  }

  await githubRequest(token, existingAsset.url, {
    method: "DELETE"
  });
}

async function publishGitHubRelease(scriptName, tagName, files, dryRun) {
  if (dryRun) {
    logStep(scriptName, `Dry-run: would create or update GitHub release ${tagName} with ${files.length} assets`);
    return;
  }

  const githubToken = requireEnv("GH_TOKEN", "GITHUB_TOKEN");
  const release = await getOrCreateGitHubRelease(scriptName, githubToken, tagName);

  for (const filePath of files) {
    await deleteExistingAssetIfNeeded(githubToken, release, filePath);
    await uploadReleaseAsset(githubToken, release.upload_url, filePath);
  }

  process.stdout.write(`[release:publish] Uploaded ${files.length} assets to ${tagName}.\n`);
}

async function main() {
  const scriptName = "release:publish";
  const dryRun = isDryRun();
  const version = await getPublicVersion();
  const tagName = assertTagMatchesVersion(version);
  const artifacts = getArtifactPaths(version);

  logStep(scriptName, `${dryRun ? "Dry-run publishing" : "Publishing"} release ${version}`);
  await runCommand("pnpm", ["release:check"]);

  const releaseFiles = await listReleaseFiles();
  const vsixPath = releaseFiles.find((filePath) => filePath.endsWith(".vsix"));
  const npmTarballPath = releaseFiles.find((filePath) => filePath.endsWith(".tgz"));
  if (!vsixPath) {
    throw new Error("VSIX artifact is missing from .release/");
  }
  if (!npmTarballPath) {
    throw new Error("npm package artifact is missing from .release/");
  }
  if (vsixPath !== artifacts.vsixPath) {
    throw new Error(`Expected VSIX artifact at ${artifacts.vsixPath}, found ${vsixPath}`);
  }
  if (npmTarballPath !== artifacts.npmTarballPath) {
    throw new Error(`Expected npm artifact at ${artifacts.npmTarballPath}, found ${npmTarballPath}`);
  }

  await publishNpmPackage(scriptName, npmTarballPath, dryRun);
  await publishVsCodeExtension(scriptName, vsixPath, dryRun);
  await publishOpenVsx(scriptName, vsixPath, dryRun);
  await publishGitHubRelease(scriptName, tagName, releaseFiles, dryRun);

  process.stdout.write(`[release:publish] Release ${tagName} ${dryRun ? "dry-run completed" : "published successfully"}.\n`);
}

main().catch((error) => {
  process.stderr.write(`[release:publish] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
