# DuckWalk

![DuckWalk banner](assets/branding/duckwalk-readme-banner.svg)

DuckWalk is a VS Code extension and MCP server for agent-generated, step-by-step code implementation, PR review playback, and question-driven codebase walkthroughs.

Instead of letting an AI agent directly edit files or answer architecture questions with loose prose, duckWalk turns the agent's output into a structured guided session. The editor then guides the developer through each change or touchpoint using numbered steps, explanations, code snippets, file navigation, and validation where relevant.

The goal is to make AI-assisted coding more understandable, reviewable, and deliberate.

## Core idea

A coding agent such as Codex, Claude Code, Cursor, Aider, or another harness creates a structured `GuidedSession`.

duckWalk then renders that session inside VS Code.

```txt
Agent / Harness
  -> MCP server
  -> Guided recipe JSON
  -> VS Code extension
  -> Step-by-step guided implementation
```

## Product modes

### 1. Guided implementation mode

The agent creates an ordered implementation path.

Each step includes:

- Global step number
- File path
- Whether the file exists
- Whether the file should be created
- Target location
- What the change does
- Why the change is needed
- Ghost code to type
- Validation rule
- Next and previous step references

The user types the code manually. Once the expected change is implemented, the ghost code and explanation disappear and the user can move to the next step.

### 2. PR review playback mode

The agent reads a diff or PR and creates a walkthrough.

The user can press play and the extension moves through the changes step by step, explaining:

- What changed
- Why it changed
- Impact
- Risk
- Relevant file and line range

A sidebar lists all changes. Clicking a row jumps to the relevant file and line.

### 3. Pathfinder walkthrough mode

The agent answers a concrete codebase question such as "how does authentication work?" by
authoring an ordered walkthrough of the real touchpoints in the repo.

Each step includes:

- Global step number
- File path
- Lens-specific flow context
- Exact primary code range
- Named evidence subranges for action and context
- Touchpoint type
- Confidence and evidence quality
- File-level rationale
- What the touchpoint does
- Why it matters in the flow
- How control or data moves to the next touchpoint
- Read-only code snippet for the explanation
- Symbol references, explicit links to the next touchpoint, and optional branch outcomes
- Follow-up actions for implementation, tests, or config

The user moves through the walkthrough manually in the sidebar, flips between story and graph
views, and sees how the architecture flow links together across files.

## MVP scope

The MVP includes:

- VS Code extension
- MCP server
- Shared schema package
- Recipe JSON files
- Markdown recipe output
- Sidebar step list
- Step navigation
- Ghost code rendering
- What and why explanation panel
- Missing-file handling
- Normalised text validation
- PR review playback from local git diff
- Pathfinder codebase walkthroughs

The MVP does not include:

- Agent API
- Hosted backend
- Direct LLM provider integration
- Speech/TTS
- User accounts
- Cloud sync
- Database
- AST validation
- GitHub App integration

Speech is not part of the MVP, but the schema should be narration-ready so it can be added later.

## Intended agent workflow

The user asks Codex App, Codex CLI, or another harness to create a guided implementation session,
PR review playback, or Pathfinder walkthrough.

The harness uses the duckWalk MCP server and calls a tool such as:

```txt
create_guided_session
create_pr_review_session
pathfinder
```

The MCP server validates the session and writes:

```txt
.guided-implementation/
  current.recipe.json
  current.recipe.md
  state.json
```

The VS Code extension loads the recipe and guides the user through the implementation,
review playback, or walkthrough.

When a session is created in a target project, duckWalk also ensures that project's
`.gitignore` includes `.guided-implementation/` unless an equivalent rule already exists.

## Setup

### Requirements

- Node.js 22+
- pnpm 10+
- VS Code 1.96+

### Install dependencies

```bash
pnpm install
```

### Build everything

```bash
pnpm build
```

### Verify the workspace

```bash
pnpm test
pnpm lint
```

## Run

### Root workspace commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
```

### Run only the MCP server

Development mode:

```bash
pnpm --filter @duckwalk/mcp-server dev
```

Built stdio server:

```bash
node apps/mcp-server/dist/server.js
```

The MCP server exposes these tools over stdio:

- `create_guided_session`
- `create_pr_review_session`
- `pathfinder`
- `get_guided_session`
- `update_step_status`

### Run only the VS Code extension build

Watch mode:

```bash
pnpm --filter duckwalk-vscode-extension dev
```

One-off build:

```bash
pnpm --filter duckwalk-vscode-extension build
```

## Use

### Expected runtime files

duckWalk reads and writes session state in:

```txt
.guided-implementation/
  current.recipe.json
  current.recipe.md
  state.json
  sessions/
```

The active workspace root in VS Code must contain `.guided-implementation/`.

### Normal workflow

1. Start the MCP server from your harness or MCP client.
2. Call `create_guided_session`, `create_pr_review_session`, or `pathfinder` with a full `GuidedSession`.
3. Open the target project in VS Code with the duckWalk extension available.
4. Open the duckWalk sidebar.
5. Start the session and move through steps with `Start Session`, `Next`, `Previous`, or direct step selection.

### Quick local smoke test

If you want to test the extension UI without wiring an external harness yet:

1. Build the repo with `pnpm build`.
2. Copy one of the example recipes to `.guided-implementation/current.recipe.json`.
3. Open the repo in VS Code.
4. Load the duckWalk sidebar and start the session.

Example commands:

```bash
mkdir -p .guided-implementation
cp .guided-implementation/examples/pathfinder.recipe.json .guided-implementation/current.recipe.json
```

When you start the session, the extension can create `state.json` automatically.

### Running the extension in development

This repo contains the extension source and build output, but it does not yet include a checked-in VS Code debug launcher.

For local extension development:

1. Open the repository in VS Code.
2. Build or watch `apps/vscode-extension`.
3. Launch an Extension Development Host using your normal VS Code extension workflow.
4. Make sure the workspace opened inside that host is the project containing `.guided-implementation/`.

### Example MCP client wiring

Any MCP-capable harness can point at the built stdio server command:

```txt
node /absolute/path/to/duckwalk/apps/mcp-server/dist/server.js
```

Use the example recipes in `.guided-implementation/examples/` as starter payload references when shaping `GuidedSession` inputs.

See [docs/pathfinder-walkthroughs.md](docs/pathfinder-walkthroughs.md) for the expanded Pathfinder contract, branch model, follow-up actions, and targeted subrange links.

## Example implementation step

```json
{
  "id": "step-001",
  "order": 1,
  "mode": "implementation",
  "file": {
    "path": "src/middleware/auth.ts",
    "exists": false,
    "createIfMissing": true
  },
  "location": {
    "strategy": "create_file"
  },
  "explanation": {
    "title": "Create the auth middleware",
    "what": "Adds a reusable Fastify middleware for checking the Authorization header.",
    "why": "Authentication should be centralised instead of duplicated inside each route.",
    "impact": "Protected routes can reject unauthenticated requests before handler logic runs.",
    "narration": {
      "short": "This step creates reusable auth middleware so route handlers do not repeat authentication checks."
    }
  },
  "ghostCode": "import type { FastifyReply, FastifyRequest } from 'fastify';\n\nexport async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {\n  const authHeader = request.headers.authorization;\n\n  if (!authHeader) {\n    return reply.code(401).send({ error: 'Missing authorization header' });\n  }\n}\n",
  "validation": {
    "type": "normalised_match"
  }
}
```

## Recommended tech stack

```txt
Language:        TypeScript
Editor:          VS Code extension
Sidebar UI:      React inside VS Code Webview
Schema:          Zod
MCP server:      TypeScript MCP SDK
State:           JSON files
Docs output:     Markdown
Git parsing:     simple-git and diff parser
Validation:      Normalised text match
Testing:         Vitest
Package manager: pnpm
Monorepo:        Turborepo
```

## Proposed repository structure

```txt
duckwalk/
  apps/
    vscode-extension/
      src/
        extension.ts
        commands/
        sidebar/
        ghost-text/
        decorations/
        codelens/
        navigation/
        validators/
        recipe-loader/
        file-watcher/
        review-playback/
        speech/

    mcp-server/
      src/
        server.ts
        tools/
          create-guided-session.ts
          create-pr-review-session.ts
          get-guided-session.ts
          update-step-status.ts

  packages/
    schema/
      src/
        guided-session.ts
        guided-step.ts
        recipe.ts
        narration.ts

    core/
      src/
        step-engine.ts
        validation.ts
        recipe-writer.ts
        markdown-writer.ts
        diff-parser.ts
```

## Development principles

- The agent should not edit source files directly.
- The MCP server should not be the agent.
- The MCP server validates and persists guided sessions.
- The VS Code extension owns rendering, navigation, validation, and user interaction.
- Recipe JSON is the machine-readable source of truth.
- Markdown recipe output is the human-readable fallback.
- Speech should be a future renderer, not a core MVP dependency.

## Future direction

duckWalk can later support:

- TTS pair-programming playback
- AST-based validation
- Test-based validation
- GitHub PR integration
- Review comments
- Team walkthrough sharing
- Recorded implementation sessions
- Local model support
- Multiple editor support
