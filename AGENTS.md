# AGENTS

## Scope

These guardrails apply to the entire `duckwalk` repo.

## Authoritative surfaces

- Treat `packages/schema/src/guided-session.ts` as the source of truth for guided session shape.
- Treat `apps/mcp-server/src/contract.ts` as the source of truth for what Codex should author for duckWalk MCP.
- Treat `apps/vscode-extension/src/sidebar/*` as the source of truth for walkthrough presentation in the editor.

## Pathfinder walkthrough rules

- Model one walkthrough per concrete user question.
- Set `mode: "codebase_walkthrough"` and include `question`, `lens`, `flow`, and ordered `steps`.
- Keep one step per touchpoint, not one step per file.
- Use one `primary` subrange that matches `location.range`.
- Use extra `action` or `context` subranges when the same touchpoint spans disjoint ranges in the same file.
- Add `touchpoint`, `confidence`, `evidenceQuality`, and `fileRationale` on every walkthrough step.
- Use `links` for the main forward path.
- Prefer `links` that target both `stepId` and `subrangeId` when the next touchpoint should land on exact evidence.
- Use `branches` for optional or forked outcomes such as missing token, invalid session, expired token, or success.
- Add `followUps` when the walkthrough should hand the user toward implementation work, tests, config, or related files.

## Drift and evidence

- Walkthrough snippets must overlap real file evidence.
- If walkthrough evidence no longer matches the repo, preserve the stale warning behavior rather than silently weakening it.
- Do not remove symbol checks or evidence overlap checks just to make stale sessions appear fresh.

## File size guardrails

- Keep source files under 400 lines.
- Prefer splitting files once they move beyond roughly 200 lines if they contain more than one responsibility.
- When refactoring a large file, extract coherent modules instead of moving unrelated helpers into a generic dump file.
- New helper files should stay focused and should usually also remain under 400 lines.

## Editing guidance

- Use `apply_patch` for manual edits.
- Preserve current session compatibility across `implementation`, `pr_review`, and `codebase_walkthrough` modes.
- Update tests when schema, markdown, MCP validation, or sidebar behavior changes.
- Run `pnpm test` and `pnpm build` after meaningful cross-package changes.
