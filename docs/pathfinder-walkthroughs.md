# Pathfinder walkthroughs

Pathfinder answers one concrete codebase question with a guided `codebase_walkthrough` session.

## Core session fields

- `question`: the exact user question being answered
- `lens`: one of `request_flow`, `data_flow`, `permission_flow`, `error_path`, or `config_dependency_flow`
- `flow`: a quick map of the major phases before step 1
- `followUps`: next actions such as opening tests, config, or implementation-related files

## Core step fields

- `touchpoint`: one of `entry`, `guard`, `read`, `write`, `transform`, `emit`, `respond`, `config`
- `confidence`: `direct`, `mixed`, or `inferred`
- `evidenceQuality`: `high`, `medium`, or `low`
- `fileRationale`: one-line explanation of why the file matters
- `subranges`: one `primary` subrange plus optional `action` or `context` subranges
- `links`: the main forward path, optionally targeting `stepId + subrangeId`
- `branches`: optional forked outcomes such as missing token, invalid session, expired token, or success

## Example walkthrough step

```json
{
  "id": "walkthrough-step-1",
  "order": 1,
  "mode": "codebase_walkthrough",
  "touchpoint": "entry",
  "confidence": "direct",
  "evidenceQuality": "high",
  "fileRationale": "This file is the first protected-route touchpoint where authentication begins.",
  "file": {
    "path": "src/auth/middleware.ts",
    "exists": true
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
      "id": "policy-context",
      "label": "Policy context",
      "role": "context",
      "range": {
        "startLine": 130,
        "startCharacter": 0,
        "endLine": 190,
        "endCharacter": 0
      },
      "summary": "Later authorization checks depend on the authenticated user injected here.",
      "symbols": ["requireRole"]
    }
  ],
  "explanation": {
    "title": "Start at the auth middleware",
    "what": "This middleware extracts the bearer token from the request.",
    "why": "Every protected route enters the authentication flow here.",
    "how": "The request header is parsed and the token is passed to the downstream auth service.",
    "impact": "Requests without a token fail before route handlers run."
  },
  "snippet": "export async function authMiddleware(request, reply) {\\n  const authHeader = request.headers.authorization;\\n  const token = authHeader?.replace('Bearer ', '');\\n}\\n",
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
    },
    {
      "id": "success-path",
      "label": "Success path",
      "condition": "A bearer token is present.",
      "outcome": "The request continues into the token validation step.",
      "targetStepId": "walkthrough-step-2",
      "targetSubrangeId": "token-validate"
    }
  ]
}
```
