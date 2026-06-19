# Installation

duckWalk ships as three public artifacts:

- VS Code extension
- MCP server npm package
- Codex plugin marketplace bundle

## 1. Install the VS Code extension

Install `duckwalk.duckwalk-vscode-extension` from either:

- VS Code Marketplace

You can also sideload the `.vsix` from GitHub Releases.

## 2. Install the MCP server

For direct harness use:

```bash
npx @duckwalk/mcp-server
```

For repeated local use:

```bash
npm install -g @duckwalk/mcp-server
duckwalk-mcp
```

## 3. Install the Codex plugin

1. Download the `duckwalk-codex-marketplace-<version>.zip` asset from GitHub Releases.
2. Extract it somewhere stable on disk.
3. Add the extracted marketplace root to Codex:

   ```bash
   codex plugin marketplace add /absolute/path/to/duckwalk-codex-marketplace
   ```

4. Install the plugin from that marketplace:

   ```bash
   codex plugin add duckwalk@duckwalk
   ```

The released plugin bundle points its MCP entry to:

```txt
npx -y @duckwalk/mcp-server
```

That means Codex users need Node.js and npm available on their machine even if they do not globally install the MCP package.

## 4. Use duckWalk

1. Create or load a guided session in the target workspace.
2. Open the duckWalk sidebar in VS Code.
3. Step through implementation, PR review, or Pathfinder walkthrough mode.
