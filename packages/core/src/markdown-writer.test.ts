import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import { renderSessionMarkdown } from "./markdown-writer";

const walkthroughSession: GuidedSession = {
  id: "auth-walkthrough",
  mode: "codebase_walkthrough",
  title: "Trace authentication flow",
  summary: "Shows how authentication moves through middleware and policy checks.",
  question: "How does authentication work in this backend?",
  lens: "permission_flow",
  flow: {
    summary: "Request -> auth middleware -> policy check",
    path: ["Request", "authMiddleware", "requireRole"],
    outcome: "Protected handlers receive an authenticated user."
  },
  followUps: [
    {
      id: "follow-up-tests",
      kind: "tests",
      label: "Open auth tests",
      description: "Inspect the auth middleware tests for the token failure branches.",
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
      fileRationale: "This file is where the protected request first enters the auth pipeline.",
      file: {
        path: "src/auth/middleware.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 3,
          startCharacter: 0,
          endLine: 10,
          endCharacter: 0
        }
      },
      subranges: [
        {
          id: "middleware-entry",
          label: "Middleware entry",
          role: "primary",
          range: {
            startLine: 3,
            startCharacter: 0,
            endLine: 10,
            endCharacter: 0
          },
          summary: "Reads the bearer token from the request.",
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n",
          symbols: ["authMiddleware"]
        },
        {
          id: "policy-check",
          label: "Policy check",
          role: "context",
          range: {
            startLine: 130,
            startCharacter: 0,
            endLine: 190,
            endCharacter: 0
          },
          summary: "Later authorization checks depend on the user injected earlier.",
          symbols: ["requireRole"]
        }
      ],
      symbols: ["authMiddleware", "requireRole"],
      explanation: {
        title: "Begin in the middleware",
        what: "The middleware reads the bearer token.",
        why: "Every protected request hits this entry point first.",
        how: "The request header is parsed before control moves into the auth service."
      },
      snippet:
        "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n",
      links: [
        {
          stepId: "walk-step-2",
          subrangeId: "service-validate",
          type: "calls",
          why: "The token is handed to the auth service for validation.",
          viaSymbol: "resolveAuthenticatedUser"
        }
      ],
      branches: [
        {
          id: "missing-token",
          label: "Missing token",
          condition: "The Authorization header is absent.",
          outcome: "The request is rejected before the handler runs."
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
      fileRationale: "This file converts the raw token into the verified actor object.",
      file: {
        path: "src/auth/service.ts"
      },
      location: {
        strategy: "range",
        range: {
          startLine: 12,
          startCharacter: 0,
          endLine: 24,
          endCharacter: 0
        }
      },
      subranges: [
        {
          id: "service-validate",
          label: "Token validation",
          role: "primary",
          range: {
            startLine: 12,
            startCharacter: 0,
            endLine: 24,
            endCharacter: 0
          },
          summary: "Verifies the token and resolves the trusted actor.",
          symbols: ["resolveAuthenticatedUser", "verifyToken"]
        }
      ],
      symbols: ["resolveAuthenticatedUser", "verifyToken"],
      explanation: {
        title: "Validate the token",
        what: "The auth service verifies the token and returns the actor context.",
        why: "Downstream authorization logic should only read trusted identity data.",
        how: "The verifier decodes claims and packages them into the actor object."
      },
      snippet:
        "export async function resolveAuthenticatedUser(token) {\n  const payload = await verifyToken(token);\n}\n"
    }
  ]
};

describe("renderSessionMarkdown", () => {
  it("renders question-driven walkthrough sessions with how and snippet sections", () => {
    const markdown = renderSessionMarkdown(walkthroughSession);

    expect(markdown).toContain("Question: How does authentication work in this backend?");
    expect(markdown).toContain("Lens: permission_flow");
    expect(markdown).toContain("## Flow Summary");
    expect(markdown).toContain("- How: The request header is parsed before control moves into the auth service.");
    expect(markdown).toContain("- Touchpoint: entry");
    expect(markdown).toContain("- Confidence: direct");
    expect(markdown).toContain("- Evidence quality: high");
    expect(markdown).toContain("- File rationale: This file is where the protected request first enters the auth pipeline.");
    expect(markdown).toContain("Middleware entry (primary): 3:0 - 10:0");
    expect(markdown).toContain("Policy check (context): 130:0 - 190:0");
    expect(markdown).toContain("### Evidence");
    expect(markdown).toContain("### Links");
    expect(markdown).toContain("walk-step-2#service-validate");
    expect(markdown).toContain("### Branches");
    expect(markdown).toContain("## Follow-ups");
    expect(markdown).toContain("### Snippet");
    expect(markdown).toContain("src/auth/middleware.ts");
  });
});
