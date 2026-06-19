import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuidedSession } from "@duckwalk/schema";

export function createImplementationSession(id: string, stepId = "step-1"): GuidedSession {
  return {
    id,
    mode: "implementation",
    title: "Implementation recipe",
    summary: "Creates a source file.",
    createdAt: "2026-06-18T00:00:00.000Z",
    steps: [
      {
        id: stepId,
        order: 1,
        mode: "implementation",
        file: {
          path: `src/${id}.ts`,
          createIfMissing: true
        },
        location: {
          strategy: "create_file"
        },
        explanation: {
          title: "Create feature file",
          what: "Adds the feature file.",
          why: "The feature starts here."
        },
        ghostCode: `export const ${id.replace(/-/g, "_")} = true;\n`,
        validation: {
          type: "normalised_match"
        }
      }
    ]
  };
}

export const prReviewSession: GuidedSession = {
  id: "mcp-review",
  mode: "pr_review",
  title: "PR review recipe",
  summary: "Walks through a diff.",
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "review-step-1",
      order: 1,
      mode: "pr_review",
      file: {
        path: "src/feature.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 3,
          endCharacter: 0
        }
      },
      explanation: {
        title: "Review feature change",
        what: "Adds the feature export.",
        why: "Needed for downstream imports.",
        impact: "The symbol is now public."
      },
      review: {
        beforeCode: "",
        afterCode: "export const feature = true;\n",
        changedRange: {
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 28
        }
      }
    }
  ]
};

export const codebaseWalkthroughSession: GuidedSession = {
  id: "mcp-walkthrough",
  mode: "codebase_walkthrough",
  title: "Trace backend authentication flow",
  summary: "Explains how authentication moves from middleware into token validation.",
  question: "How does authentication work in this backend?",
  lens: "permission_flow",
  flow: {
    summary: "Request -> auth middleware -> auth service",
    path: ["Request", "authMiddleware", "resolveAuthenticatedUser"],
    outcome: "Authenticated requests get a resolved user context."
  },
  followUps: [
    {
      id: "follow-up-tests",
      kind: "tests",
      label: "Inspect auth tests",
      description: "Open the auth middleware tests to inspect the failure branches.",
      file: "tests/auth/middleware.test.ts"
    }
  ],
  createdAt: "2026-06-18T00:00:00.000Z",
  steps: [
    {
      id: "walk-step-1",
      order: 1,
      mode: "codebase_walkthrough",
      touchpoint: "entry",
      confidence: "direct",
      evidenceQuality: "high",
      fileRationale: "This file is the first protected-route touchpoint for authentication.",
      file: {
        path: "src/auth/middleware.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 6,
          endCharacter: 0
        }
      },
      subranges: [
        {
          id: "middleware-entry",
          label: "Middleware entry",
          role: "primary",
          range: {
            startLine: 1,
            startCharacter: 0,
            endLine: 6,
            endCharacter: 0
          },
          summary: "Reads the bearer token from the request.",
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n",
          symbols: ["authMiddleware"]
        },
        {
          id: "policy-context",
          label: "Policy context",
          role: "context",
          range: {
            startLine: 130,
            startCharacter: 0,
            endLine: 190,
            endCharacter: 0
          },
          summary: "Later policy checks use the authenticated user context.",
          symbols: ["requireRole"]
        }
      ],
      symbols: ["authMiddleware", "resolveAuthenticatedUser", "requireRole"],
      explanation: {
        title: "Start in the auth middleware",
        what: "The middleware reads the bearer token from the incoming request.",
        why: "Every protected route enters the auth flow at this touchpoint.",
        how: "The authorization header is parsed and its token is passed into the auth service.",
        impact: "Missing tokens fail before route handlers execute."
      },
      snippet:
        "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n",
      links: [
        {
          stepId: "walk-step-2",
          subrangeId: "auth-service-validate",
          type: "calls",
          why: "The extracted token is passed into the auth service.",
          viaSymbol: "resolveAuthenticatedUser"
        }
      ],
      branches: [
        {
          id: "missing-token",
          label: "Missing token",
          condition: "The Authorization header is missing or malformed.",
          outcome: "The request exits before the handler executes."
        },
        {
          id: "success-path",
          label: "Success path",
          condition: "A bearer token is present.",
          outcome: "The request continues into the auth service.",
          targetStepId: "walk-step-2",
          targetSubrangeId: "auth-service-validate"
        }
      ]
    },
    {
      id: "walk-step-2",
      order: 2,
      mode: "codebase_walkthrough",
      touchpoint: "transform",
      confidence: "direct",
      evidenceQuality: "high",
      fileRationale: "This file converts the raw token into the trusted authenticated actor.",
      file: {
        path: "src/auth/service.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 1,
          startCharacter: 0,
          endLine: 6,
          endCharacter: 0
        }
      },
      subranges: [
        {
          id: "auth-service-validate",
          label: "Auth service validation",
          role: "primary",
          range: {
            startLine: 1,
            startCharacter: 0,
            endLine: 6,
            endCharacter: 0
          },
          summary: "Validates the token and resolves the authenticated user.",
          snippet:
            "export async function resolveAuthenticatedUser(token) {\n  const payload = await verifyToken(token);\n}\n",
          symbols: ["resolveAuthenticatedUser", "verifyToken"]
        }
      ],
      symbols: ["resolveAuthenticatedUser", "verifyToken"],
      explanation: {
        title: "Validate the token in the auth service",
        what: "The auth service verifies the token and resolves the user identity.",
        why: "Downstream guards need a trusted identity object.",
        how: "The token verifier decodes claims and returns the authenticated actor."
      },
      snippet:
        "export async function resolveAuthenticatedUser(token) {\n  const payload = await verifyToken(token);\n}\n"
    }
  ]
};

export async function writeWalkthroughFixture(rootDir: string) {
  const middlewarePath = path.join(rootDir, "src/auth/middleware.ts");
  const servicePath = path.join(rootDir, "src/auth/service.ts");

  await mkdir(path.dirname(middlewarePath), { recursive: true });
  await writeFile(
    middlewarePath,
    [
      "export async function authMiddleware(request, reply) {",
      "  const authHeader = request.headers.authorization;",
      "  const token = authHeader?.replace('Bearer ', '');",
      "  if (!token) {",
      "    throw new Error('missing token');",
      "  }",
      "}",
      "",
      ...Array.from({ length: 122 }, () => "// filler"),
      "export function requireRole(user, role) {",
      "  return user.roles.includes(role);",
      "}",
      ...Array.from({ length: 57 }, () => "// tail filler")
    ].join("\n") + "\n"
  );
  await writeFile(
    servicePath,
    [
      "export async function resolveAuthenticatedUser(token) {",
      "  const payload = await verifyToken(token);",
      "  return { userId: payload.sub, roles: payload.roles };",
      "}",
      "",
      "export async function verifyToken(token) {",
      "  return { sub: token, roles: ['admin'] };",
      "}"
    ].join("\n") + "\n"
  );
}
