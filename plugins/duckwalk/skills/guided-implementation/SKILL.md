---
name: guided-implementation
description: Create duckWalk implementation sessions that turn an agent plan into a step-by-step coding recipe with file targets, explanations, ghost code, and validation.
---

# duckWalk Implementation

Use this skill when the user wants Codex to prepare a duckWalk implementation recipe instead of
editing files directly.

Do not search the duckWalk repo or the user's home directory for examples before using the MCP
tools. Use the contract in this skill.

Prefer the duckWalk MCP tools over hand-writing `.guided-implementation` files:

- `get_duckwalk_contract` to fetch the exact contract, examples, and tool guidance
- `validate_guided_session` to validate a draft payload before writing files
- `create_guided_session` to validate and persist a full implementation session in the target
  workspace
- `get_guided_session` only when you explicitly need to inspect an existing session or state
- `update_step_status` only when the user explicitly wants step state changed from Codex

Always pass `workspaceRoot` as the absolute task workspace path, typically from `pwd`. The
duckWalk MCP server may run from the plugin repo, so omitting `workspaceRoot` can write the
session into the wrong place.

When `create_guided_session` writes a session into the target workspace, duckWalk also ensures
the target workspace `.gitignore` contains `.guided-implementation/` unless an equivalent ignore
rule already exists.

Minimal `create_guided_session` call shape:

```json
{
  "workspaceRoot": "/absolute/path/to/task/workspace",
  "session": {
    "id": "feature-auth-middleware",
    "mode": "implementation",
    "title": "Create auth middleware",
    "summary": "Adds a reusable auth middleware and wires it into routes.",
    "createdAt": "2026-06-18T00:00:00.000Z",
    "steps": [
      {
        "id": "step-1",
        "order": 1,
        "mode": "implementation",
        "file": {
          "path": "src/middleware/auth.ts",
          "createIfMissing": true
        },
        "location": {
          "strategy": "create_file"
        },
        "explanation": {
          "title": "Create the auth middleware",
          "what": "Adds a reusable authorization middleware.",
          "why": "Route handlers should not repeat auth checks."
        },
        "ghostCode": "export async function authMiddleware() {}\\n",
        "validation": {
          "type": "normalised_match"
        }
      }
    ]
  }
}
```

Required session fields:

- `id`, `mode`, `title`, `summary`, `createdAt`, `steps`
- each implementation step needs `id`, `order`, `mode: "implementation"`, `file`, `location`,
  `explanation`, and `ghostCode`

Allowed location strategies:

- `create_file`
- `line`
- `range`
- `after_text`
- `before_text`

Working rules:

1. Build a full `GuidedSession` with `mode: "implementation"` before calling
   `create_guided_session`.
2. Keep steps ordered and concrete. Each step should target one file/location and explain `what`
   and `why` clearly.
3. Use `ghostCode` for the code the developer should type manually in the editor.
4. For functions or non-trivial logic, include short pragmatic comments in `ghostCode` that say
   what the code does. If a behavior is important to preserve, say so explicitly with a brief
   `Important:` comment near that logic.
5. Prefer `validation.type: "normalised_match"` unless the user explicitly asks for a different
   validation approach.
6. If you are uncertain about the payload shape, call `get_duckwalk_contract` first.
7. Use `validate_guided_session` to check a draft payload before writing when the session is
   non-trivial.
8. Do not call `get_guided_session` first just to learn the schema. Use this contract instead.
9. Inspect only the current task workspace when choosing file targets. If the workspace is empty,
   choose a minimal explicit scaffold instead of searching the repo or the user's home directory for
   examples.
10. After creating the session, point the user to the duckWalk VS Code sidebar for playback.
