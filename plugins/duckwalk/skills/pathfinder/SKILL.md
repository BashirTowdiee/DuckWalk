---
name: pathfinder
description: Create duckWalk Pathfinder codebase walkthrough sessions that answer a concrete architecture question with an ordered story of repo touchpoints, explanations, ranges, and snippets.
---

# duckWalk Pathfinder

Use this skill when the user asks how a concrete flow works in a codebase, for example:

- how authentication works
- how a request moves through the backend
- where authorization checks happen
- how a feature links across files

Do not search the duckWalk repo or the user's home directory for examples before using the MCP
tools. Use the contract in this skill.

Prefer the duckWalk MCP tools first:

- `get_duckwalk_contract` to fetch the exact contract, examples, and tool guidance
- `validate_guided_session` to validate a draft payload before writing files
- `pathfinder` to validate and persist a full codebase walkthrough session in the target workspace
- `get_guided_session` only when you explicitly need to inspect an existing walkthrough or state

Always pass `workspaceRoot` as the absolute task workspace path, typically from `pwd`. The
duckWalk MCP server may run from the plugin repo, so omitting `workspaceRoot` can write the
session into the wrong place.

Minimal `pathfinder` call shape:

```json
{
  "workspaceRoot": "/absolute/path/to/task/workspace",
  "session": {
    "id": "walkthrough-authentication-flow",
    "mode": "codebase_walkthrough",
    "title": "Trace backend authentication flow",
    "summary": "Shows how a protected request moves from middleware into token validation.",
    "question": "How does authentication work in this backend project?",
    "createdAt": "2026-06-18T00:00:00.000Z",
    "steps": [
      {
        "id": "walkthrough-step-1",
        "order": 1,
        "mode": "codebase_walkthrough",
        "file": {
          "path": "src/auth/middleware.ts"
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
          "title": "Start at the auth middleware",
          "what": "This middleware extracts the bearer token from the request.",
          "why": "Every protected route enters the authentication flow here.",
          "how": "The request header is parsed and the token is passed to the downstream auth service."
        },
        "snippet": "export async function authMiddleware(request, reply) {}\\n"
      }
    ]
  }
}
```

Required walkthrough session fields:

- `id`, `mode`, `title`, `summary`, `question`, `createdAt`, `steps`
- each walkthrough step needs `id`, `order`, `mode: "codebase_walkthrough"`, `file`, `location`,
  `explanation`, and `snippet`
- every walkthrough step must use `location.strategy: "range"` with a usable `location.range`
- when one touchpoint spans disjoint sections of the same file, keep one primary `location.range`
  and add the extra spans through optional `relatedRanges`

Working rules:

1. Build one walkthrough per concrete user question. Do not try to map the whole repo at once.
2. Inspect only the current task workspace and the files needed to answer the question.
3. Keep the walkthrough linear. Each step should represent one touchpoint in the flow.
4. Each step must explain `what`, `why`, and `how`, and must include the exact code snippet being
   discussed.
5. Prefer the real request path through the system over a broad subsystem inventory.
6. Use `validate_guided_session` before writing when the walkthrough is non-trivial.
7. Do not ask the MCP server to discover the flow. Codex should inspect the repo and author the
   ordered steps itself.
8. After creating the session, tell the user to open the duckWalk sidebar and step through the
   walkthrough.
