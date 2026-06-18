---
name: pr-review-playback
description: Create duckWalk PR review playback sessions that walk a developer through code changes step by step with before/after context, ranges, and impact notes.
---

# duckWalk PR Review Playback

Use this skill when the user wants a duckWalk walkthrough of an existing diff, PR, or set of
code changes.

Do not search the duckWalk repo or the user's home directory for examples before using the MCP
tools. Use the contract in this skill.

Prefer the duckWalk MCP tools first:

- `get_duckwalk_contract` to fetch the exact contract, examples, and tool guidance
- `validate_guided_session` to validate a draft payload before writing files
- `create_pr_review_session` to validate and persist a PR review playback session in the target
  workspace
- `get_guided_session` only when you explicitly need to inspect an existing review session or state

Always pass `workspaceRoot` as the absolute task workspace path, typically from `pwd`. The
duckWalk MCP server may run from the plugin repo, so omitting `workspaceRoot` can write the
session into the wrong place.

Minimal `create_pr_review_session` call shape:

```json
{
  "workspaceRoot": "/absolute/path/to/task/workspace",
  "session": {
    "id": "review-auth-middleware",
    "mode": "pr_review",
    "title": "Review auth middleware changes",
    "summary": "Walks through the middleware and route wiring changes.",
    "createdAt": "2026-06-18T00:00:00.000Z",
    "steps": [
      {
        "id": "review-step-1",
        "order": 1,
        "mode": "pr_review",
        "file": {
          "path": "src/middleware/auth.ts"
        },
        "location": {
          "strategy": "range",
          "range": {
            "startLine": 1,
            "startCharacter": 0,
            "endLine": 12,
            "endCharacter": 0
          }
        },
        "explanation": {
          "title": "Review the middleware implementation",
          "what": "Adds a reusable auth check.",
          "why": "Routes should fail fast before business logic.",
          "impact": "Protected handlers now reject missing authorization headers."
        },
        "review": {
          "beforeCode": "",
          "afterCode": "export async function authMiddleware() {}\\n",
          "changedRange": {
            "startLine": 1,
            "startCharacter": 0,
            "endLine": 12,
            "endCharacter": 0
          }
        }
      }
    ]
  }
}
```

Required PR review step fields:

- `id`, `order`, `mode: "pr_review"`, `file`, `location`, `explanation`, `review`
- every step must include a usable range through `location.range` or `review.changedRange`

Working rules:

1. Build a full `GuidedSession` with `mode: "pr_review"` before calling
   `create_pr_review_session`.
2. Every step must include a usable code range, either through `location.range` or
   `review.changedRange`.
3. Include concise `what`, `why`, and when useful `impact` or `risk` so the playback reads like a
   review walkthrough, not just a raw diff.
4. Use `beforeCode` and `afterCode` when the change is easier to understand with direct code
   contrast.
5. If you are uncertain about the payload shape, call `get_duckwalk_contract` first.
6. Use `validate_guided_session` to check a draft payload before writing when the review session is
   non-trivial.
7. Do not call `get_guided_session` first just to learn the schema. Use this contract instead.
8. Inspect only the current task workspace and the explicit diff or files the user asked about.
   Do not search the repo or the user's home directory for generic PR review examples.
9. After creating the session, tell the user to open the duckWalk sidebar and step through the
   review.
