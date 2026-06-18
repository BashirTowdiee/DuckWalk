# DuckWalk Roadmap

This roadmap is organised by product maturity rather than dates.

## Milestone 0: Project foundation

Goal: Establish the repository and shared contracts.

Deliverables:

- pnpm workspace
- Turborepo setup
- TypeScript config
- Vitest setup
- `apps/vscode-extension`
- `apps/mcp-server`
- `packages/schema`
- `packages/core`
- Initial docs
- Example guided recipe

Outcome:

The project has a clear structure and can compile/test basic packages.

## Milestone 1: Guided session schema

Goal: Define the contract that all agents and renderers use.

Deliverables:

- `GuidedSession` schema
- `GuidedStep` schema
- `StepExplanation` schema
- `StepLocation` schema
- `StepValidation` schema
- Narration-ready explanation shape
- JSON examples
- Markdown recipe writer

Outcome:

Any compatible agent can produce a recipe that DuckWalk understands.

## Milestone 2: MCP recipe intake

Goal: Let Codex and other harnesses create DuckWalk sessions.

Deliverables:

- MCP server
- `create_guided_session`
- `create_pr_review_session`
- `pathfinder`
- `get_guided_session`
- `update_step_status`
- Schema validation
- Recipe file writing
- Markdown recipe generation
- Clear tool errors

Outcome:

Codex App, Codex CLI, or another MCP-capable harness can create guided implementation, PR review,
and codebase walkthrough sessions.

## Milestone 3: VS Code extension shell

Goal: Display guided sessions inside VS Code.

Deliverables:

- Extension activation
- Command registration
- Recipe loader
- File watcher
- Sidebar webview
- Step list
- Active step details
- Status bar item

Outcome:

A recipe file appears as an interactive sidebar inside VS Code.

## Milestone 4: Step navigation

Goal: Make the recipe executable as an implementation path.

Deliverables:

- Start session
- Next step
- Previous step
- Click step to navigate
- Open target file
- Move cursor to target location
- Highlight target range
- Handle missing files
- Create empty missing files when allowed

Outcome:

The user can move through a multi-file implementation path in the correct order.

## Milestone 5: Ghost implementation mode

Goal: Guide the user through manually typing each implementation step.

Deliverables:

- Ghost code rendering
- Description above or beside target code
- Typing progress tracking
- Normalised text validation
- Step completion detection
- Ghost text removal on completion
- Revalidate command
- Basic mismatch feedback

Outcome:

The user can implement generated code manually while DuckWalk checks progress.

## Milestone 6: PR review playback

Goal: Turn diffs and PRs into guided walkthroughs.

Deliverables:

- `pr_review` session mode
- Sidebar review list
- Play and pause controls
- Next and previous controls
- Jump to changed line
- Highlight changed range
- Explanation panel
- Local git diff support

Outcome:

The user can press play and walk through a PR or local diff step by step.

## Milestone 6.5: Pathfinder codebase walkthroughs

Goal: Turn architecture questions into guided codebase stories.

Deliverables:

- `codebase_walkthrough` session mode
- `pathfinder` MCP tool
- Question-driven walkthrough schema
- Sidebar walkthrough rendering
- File/range jump support for walkthrough steps
- Walkthrough markdown output
- Example architecture prompts and recipes

Outcome:

The user can ask how a concrete flow works in a codebase and step through the linked touchpoints
inside duckWalk.

## Milestone 7: MVP polish

Goal: Make the MVP usable on real projects.

Deliverables:

- Better empty states
- Better validation errors
- Recover from invalid recipe files
- Better handling for moved files
- Better handling for user edits outside the active step
- Example prompts for Codex
- Example recipes
- Setup docs
- Basic extension tests
- Basic MCP server tests

Outcome:

The project is suitable for private dogfooding.

## Milestone 8: Smarter validation

Goal: Allow developers to type equivalent code, not only exact code.

Deliverables:

- AST-based validation for TypeScript
- Import detection
- Function/class/type detection
- Symbol existence checks
- Optional test-command validation
- Configurable validation strategy per step

Outcome:

DuckWalk becomes less brittle and more developer-friendly.

## Milestone 9: GitHub PR integration

Goal: Support real PR workflows beyond local diffs.

Deliverables:

- GitHub PR fetch
- PR file list
- PR diff parsing
- PR review session generation input helpers
- Open changed files from PR context
- Optional review summary generation
- Optional draft PR walkthrough comment

Outcome:

DuckWalk can be used to understand and explain GitHub PRs.

## Milestone 10: Speech-ready pair programming

Goal: Add spoken explanations without changing the core session model.

Deliverables:

- Step narrator interface
- Browser speech narrator
- Read current step
- Auto-read on step activation
- Stop/repeat controls
- Voice settings
- Optional cloud TTS provider support

Outcome:

DuckWalk starts to feel like an AI pair programmer that explains code changes aloud.

## Milestone 11: Team workflows

Goal: Make guided recipes shareable across teams.

Deliverables:

- Save completed sessions
- Export walkthroughs
- Share recipe files
- Review playback history
- Team prompt templates
- Onboarding recipes
- Internal codebase walkthroughs

Outcome:

Teams can use DuckWalk for onboarding, async reviews, and learning codebases.

## Milestone 12: Multi-harness ecosystem

Goal: Make DuckWalk usable from many agent harnesses.

Deliverables:

- Codex setup guide
- Claude Code setup guide
- Cursor setup guide
- Aider setup guide
- Generic CLI recipe importer
- MCP compatibility tests
- Agent prompt templates

Outcome:

DuckWalk becomes an agent-agnostic guided coding layer.

## Future ideas

Potential future features:

- Test failure repair walkthroughs
- Migration recipes
- Refactor recipes
- Junior onboarding paths
- Security review playback
- Architecture decision playback
- Recording of completed implementation sessions
- Visual diff timeline
- Comment-based explanations
- Local model support
- JetBrains extension
- Web-based Monaco demo
