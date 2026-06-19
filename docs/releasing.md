# Releasing

## Required credentials

Configure these secrets before automated release publishing:

- `NODE_AUTH_TOKEN` or `NPM_TOKEN` for npm publish
- `VSCE_PAT` for the VS Code Marketplace publisher
- `GITHUB_TOKEN` or `GH_TOKEN` for GitHub Release creation

## Local release flow

1. Bump the public version:

   ```bash
   pnpm release:version 0.1.2
   ```

2. Verify and package the release:

   ```bash
   pnpm release:check
   ```

3. Publish the release:

   ```bash
   pnpm release:publish
   ```

4. Simulate the publish path without live registries:

   ```bash
   pnpm release:publish --dry-run
   ```

## CI release flow

- Push a semver tag such as `v0.1.2`.
- The release workflow verifies the repo, publishes npm and VS Code Marketplace artifacts, and creates or updates the GitHub Release.

## GitHub Release behavior

- `pnpm release:publish` does not require the `gh` CLI.
- The script talks to the GitHub Releases API directly using `GITHUB_TOKEN` or `GH_TOKEN`.

## Rollback guidance

- npm: prefer `npm deprecate` over unpublish once a version is public.
- VS Code Marketplace: publish a fixed follow-up version rather than trying to erase a bad version.
- GitHub Releases: rerun `pnpm release:publish` for the same tag after fixing the artifacts; the script replaces matching asset names before uploading new ones.
