# DuckWalk Plan

This document defines the initial build plan for DuckWalk.

## Objective

Build an MVP that lets an external agent or coding harness create a structured guided coding session through an MCP server. A VS Code extension then renders that session as a step-by-step coding or PR review experience.

The MVP should prove the core loop:

```txt
Agent creates recipe
-> MCP server stores recipe
-> VS Code extension loads recipe
-> User follows guided steps
-> Extension validates progress
```

## Non-goals for MVP

The following are deliberately out of scope:

- Building an agent API
- Calling LLM providers directly
- Hosting a backend
- Adding speech/TTS
- Adding user accounts
- Supporting multiple editors
- Implementing AST validation
- Posting GitHub PR comments
- Running full test-based validation
- Supporting cloud sync

## Architecture

```txt
Codex App / Codex CLI / other harness
        |
        v
DuckWalk MCP server
        |
        v
.guided-implementation/current.recipe.json
.guided-implementation/current.recipe.md
.guided-implementation/state.json
        |
        v
DuckWalk VS Code extension
```

## Packages

### `apps/vscode-extension`

Owns the user experience.

Responsibilities:

- Load recipe files
- Watch `.guided-implementation`
- Render sidebar
- Render ghost code
- Render explanations
- Navigate between steps
- Create missing files when allowed
- Validate user-typed code
- Support PR review playback
- Persist UI state

### `apps/mcp-server`

Owns agent-facing tools.

Responsibilities:

- Expose MCP tools
- Validate incoming session payloads
- Write recipe JSON
- Write Markdown recipe
- Read existing recipe state
- Update step status if requested

The MCP server does not call LLMs in the MVP.

### `packages/schema`

Owns shared types and validation.

Responsibilities:

- `GuidedSession`
- `GuidedStep`
- `StepExplanation`
- `StepLocation`
- `StepValidation`
- `ReviewPlaybackStep`
- `Narration` placeholder shape

### `packages/core`

Owns shared logic.

Responsibilities:

- Step ordering
- Step state machine
- Recipe writer
- Markdown writer
- Normalised validation
- Diff parsing
- Review step grouping helpers

## Data model

### Guided session

```ts
export type GuidedSession = {
  id: string;
  mode: "implementation" | "pr_review";
  title: string;
  summary: string;
  createdAt: string;
  steps: GuidedStep[];
};
```

### Guided step

```ts
export type GuidedStep = {
  id: string;
  order: number;
  file: GuidedFileTarget;
  location: GuidedLocation;
  explanation: StepExplanation;
  ghostCode?: string;
  reviewCode?: {
    before?: string;
    after?: string;
  };
  validation?: StepValidation;
  status?: StepStatus;
};
```

### Explanation

```ts
export type StepExplanation = {
  title: string;
  what: string;
  why: string;
  impact?: string;
  risk?: string;
  narration?: {
    short: string;
    detailed?: string;
  };
};
```

The narration field is for future TTS. It should be accepted by the schema but not rendered as speech in the MVP.

## MCP tools

### `create_guided_session`

Accepts a complete guided session.

Input:

```ts
{
  session: GuidedSession
}
```

Output:

```ts
{
  sessionId: string;
  recipePath: string;
  markdownPath: string;
}
```

Behaviour:

- Validate session schema
- Ensure steps are globally ordered
- Ensure IDs are unique
- Write recipe JSON
- Write Markdown recipe
- Set as current session

### `create_pr_review_session`

Accepts a PR review walkthrough session.

Input:

```ts
{
  session: GuidedSession
}
```

Output:

```ts
{
  sessionId: string;
  recipePath: string;
  markdownPath: string;
}
```

Behaviour:

- Validate `mode` is `pr_review`
- Validate each step has file and range
- Write recipe JSON
- Write Markdown recipe
- Set as current session

### `get_guided_session`

Returns the current or specified session.

Input:

```ts
{
  sessionId?: string
}
```

Output:

```ts
{
  session: GuidedSession
}
```

### `update_step_status`

Updates step status.

Input:

```ts
{
  sessionId: string;
  stepId: string;
  status: StepStatus;
}
```

Output:

```ts
{
  ok: true
}
```

## VS Code extension commands

Implement these commands:

```txt
DuckWalk: Load Current Recipe
DuckWalk: Start Session
DuckWalk: Go To Next Step
DuckWalk: Go To Previous Step
DuckWalk: Show Current Step
DuckWalk: Revalidate Current Step
DuckWalk: Create Missing File
DuckWalk: Open Markdown Recipe
DuckWalk: Start Review Playback
DuckWalk: Pause Review Playback
```

## Implementation phases

### Phase 1: Repository setup

Tasks:

- Create pnpm workspace
- Add Turborepo
- Add TypeScript config
- Add Vitest
- Add ESLint and Prettier
- Create package structure
- Create placeholder README, plan and roadmap

Done when:

- `pnpm install` works
- `pnpm test` works
- Packages compile

### Phase 2: Schema and core

Tasks:

- Implement Zod schemas
- Implement TypeScript types
- Implement recipe writer
- Implement Markdown writer
- Implement normalised text validator
- Add tests for schema validation

Done when:

- A valid session writes JSON and Markdown
- Invalid sessions are rejected
- Validation utility is tested

### Phase 3: MCP server

Tasks:

- Create MCP server
- Add `create_guided_session`
- Add `create_pr_review_session`
- Add `get_guided_session`
- Add `update_step_status`
- Write recipe files into `.guided-implementation`
- Add tests for tool handlers

Done when:

- A harness can call MCP tools
- Recipe files are created correctly
- Schema validation errors are returned clearly

### Phase 4: VS Code extension recipe loading

Tasks:

- Create extension shell
- Register commands
- Load `.guided-implementation/current.recipe.json`
- Watch recipe file changes
- Render sidebar with step list
- Display active step details

Done when:

- Opening a workspace with a recipe shows the session in the sidebar
- Clicking a step activates it

### Phase 5: Navigation

Tasks:

- Open file for active step
- Move cursor to target location
- Highlight target range
- Support next and previous step
- Handle missing files
- Create empty files when allowed

Done when:

- User can move through a multi-file recipe
- Missing files are handled cleanly

### Phase 6: Ghost code

Tasks:

- Render ghost code using decorations
- Track user typing
- Update ghost text progress
- Hide ghost text when complete
- Show validation status

Done when:

- User can type through a guided step
- The extension detects completion
- The user can advance to the next step

### Phase 7: PR review playback

Tasks:

- Load `pr_review` sessions
- Render review sidebar
- Jump to changed range
- Highlight changed range
- Add play, pause, next and previous
- Display what, why, impact and risk

Done when:

- User can play through a review session step by step

### Phase 8: Polish

Tasks:

- Improve error messages
- Add status bar item
- Add empty states
- Add recipe examples
- Add docs for Codex prompt usage
- Add basic extension tests

Done when:

- MVP is usable end to end on a real repository

## First manual test scenario

Use a small Fastify repo.

Prompt Codex:

```txt
Use the DuckWalk MCP server.

Do not edit source files directly.

Inspect this repository and create a guided implementation session for adding basic auth middleware.

Call create_guided_session with an ordered implementation recipe.

Each step must include:
- file path
- whether the file exists
- whether the file should be created
- target location strategy
- what the change does
- why the change is needed
- exact ghost code
- validation type
```

Expected result:

- MCP writes `current.recipe.json`
- VS Code extension loads it
- Sidebar shows steps
- Step 1 creates or opens the target file
- Ghost code appears
- User types implementation
- Step validates
- Next step opens the next file

## Success criteria

MVP is successful when:

- A third-party harness can create a guided session through MCP
- The VS Code extension can load that session
- The user can follow the implementation path step by step
- Ghost code renders in the editor
- Completed code causes the step to clear
- Multi-file navigation works
- Missing-file flow works
- PR review playback can jump through changes
