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
    "lens": "permission_flow",
    "flow": {
      "summary": "Request -> auth middleware -> auth service -> route guard",
      "path": ["Request", "authMiddleware", "resolveAuthenticatedUser", "requireRole"],
      "entrypoint": "HTTP request to a protected route",
      "outcome": "Only authenticated requests with the right role reach the handler."
    },
    "followUps": [
      {
        "id": "follow-up-tests",
        "kind": "tests",
        "label": "Inspect auth tests",
        "description": "Open the middleware tests to confirm the success path and failure branches.",
        "file": "tests/auth/middleware.test.ts"
      }
    ],
    "createdAt": "2026-06-18T00:00:00.000Z",
    "steps": [
      {
        "id": "walkthrough-step-1",
        "order": 1,
        "mode": "codebase_walkthrough",
        "touchpoint": "entry",
        "confidence": "direct",
        "evidenceQuality": "high",
        "fileRationale": "This file is the first protected-route touchpoint where authentication begins.",
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
        "subranges": [
          {
            "id": "middleware-entry",
            "label": "Middleware entry",
            "role": "primary",
            "range": {
              "startLine": 1,
              "startCharacter": 0,
              "endLine": 12,
              "endCharacter": 0
            },
            "summary": "Reads the Authorization header and extracts the bearer token.",
            "symbols": ["authMiddleware"]
          },
          {
            "id": "downstream-policy-context",
            "label": "Downstream policy context",
            "role": "context",
            "range": {
              "startLine": 130,
              "startCharacter": 0,
              "endLine": 190,
              "endCharacter": 0
            },
            "summary": "Later role checks depend on the authenticated user injected here.",
            "symbols": ["requireRole"]
          }
        ],
        "explanation": {
          "title": "Start at the auth middleware",
          "what": "This middleware extracts the bearer token from the request.",
          "why": "Every protected route enters the authentication flow here.",
          "how": "The request header is parsed and the token is passed to the downstream auth service."
        },
        "snippet": "export async function authMiddleware(request, reply) {}\\n",
        "symbols": ["authMiddleware", "resolveAuthenticatedUser", "requireRole"],
        "links": [
          {
            "stepId": "walkthrough-step-2",
            "subrangeId": "token-validate",
            "type": "calls",
            "why": "The extracted token is validated by the auth service before the request can continue.",
            "viaSymbol": "resolveAuthenticatedUser"
          }
        ],
        "branches": [
          {
            "id": "missing-token",
            "label": "Missing token",
            "condition": "The Authorization header is missing or malformed.",
            "outcome": "The request fails before the route handler runs."
          }
        ]
      }
    ]
  }
}
```

Required walkthrough session fields:

- `id`, `mode`, `title`, `summary`, `question`, `lens`, `flow`, `createdAt`, `steps`
- each walkthrough step needs `id`, `order`, `mode: "codebase_walkthrough"`, `file`, `location`,
  `touchpoint`, `confidence`, `evidenceQuality`, `fileRationale`, `explanation`, `snippet`, and `subranges`
- every walkthrough step must use `location.strategy: "range"` with a usable `location.range`
- every walkthrough step must include exactly one `primary` subrange that matches `location.range`
- when one touchpoint spans disjoint sections of the same file, model the additional spans as named
  `action` or `context` subranges
- use `links` to explain why the next touchpoint follows from the current one, and add `subrangeId`
  when the user should land on exact evidence in the next step
- use `branches` for forked outcomes such as missing token, expired session, invalid token, or success
- use `symbols` on steps or subranges when they help the reader track the flow in code terms
- add `followUps` when the walkthrough should hand the user toward tests, config, docs, or follow-on implementation work

Working rules:

1. Build one walkthrough per concrete user question. Do not try to map the whole repo at once.
2. Inspect only the current task workspace and the files needed to answer the question.
3. Start at the real execution entrypoint, then follow calls, hooks, guards, and data handoffs in
   the order they run.
4. Keep the walkthrough linear by default. Each step should represent one touchpoint in the flow.
5. Each step must explain `what`, `why`, and `how`, and must include the exact code snippet being
   discussed.
6. Use named subranges to distinguish the actionable code from supporting context.
7. Use `touchpoint`, `confidence`, and `evidenceQuality` to make the story scannable before the user reads the prose.
8. Add branches when the flow has real forks. Do not fake separate steps when the mental model is still one touchpoint.
9. Add file-level rationale so the user knows why the file matters before reading the range details.
10. Preserve drift detection. If saved snippets or symbols no longer match the repo, the walkthrough should surface as stale rather than silently pretending it is current.
11. Prefer the real request path through the system over a broad subsystem inventory.
12. Use `validate_guided_session` before writing when the walkthrough is non-trivial.
13. Do not ask the MCP server to discover the flow. Codex should inspect the repo and author the
   ordered steps itself.
14. After creating the session, tell the user to open the duckWalk sidebar and step through the
   walkthrough.
