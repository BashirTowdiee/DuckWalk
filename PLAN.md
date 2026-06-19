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

## Delivery detail

The phase-by-phase delivery checklist and the original manual test walkthrough now live in
[docs/mvp-delivery-plan.md](docs/mvp-delivery-plan.md).

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
