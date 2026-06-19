import { describe, expect, it } from "vitest";

import { guidedSessionSchema } from "./guided-session";

describe("guidedSessionSchema", () => {
  it("accepts a valid implementation session", () => {
    const result = guidedSessionSchema.parse({
      id: "session-1",
      mode: "implementation",
      title: "Implement auth middleware",
      summary: "Adds an auth middleware file.",
      createdAt: "2026-06-18T00:00:00.000Z",
      steps: [
        {
          id: "step-1",
          order: 1,
          mode: "implementation",
          file: {
            path: "src/auth.ts",
            createIfMissing: true
          },
          location: {
            strategy: "create_file"
          },
          explanation: {
            title: "Create auth module",
            what: "Adds the middleware file.",
            why: "Route handlers should not duplicate checks.",
            narration: {
              short: "Create reusable auth middleware."
            }
          },
          ghostCode: "export const auth = true;\n",
          validation: {
            type: "normalised_match"
          }
        }
      ]
    });

    expect(result.steps).toHaveLength(1);
  });

  it("rejects steps that do not match the session mode", () => {
    const result = guidedSessionSchema.safeParse({
      id: "session-2",
      mode: "implementation",
      title: "Bad session",
      summary: "Contains a review step.",
      createdAt: "2026-06-18T00:00:00.000Z",
      steps: [
        {
          id: "step-1",
          order: 1,
          mode: "pr_review",
          file: {
            path: "src/auth.ts"
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
            title: "Review auth module",
            what: "Shows the auth diff.",
            why: "Explains the change."
          },
          review: {
            afterCode: "export const auth = true;\n"
          }
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid codebase walkthrough session", () => {
    const result = guidedSessionSchema.parse({
      id: "walkthrough-1",
      mode: "codebase_walkthrough",
      title: "Trace authentication flow",
      summary: "Shows how auth moves from request entry to policy checks.",
      question: "How does authentication work in this backend?",
      lens: "permission_flow",
      flow: {
        summary: "Request -> auth middleware -> policy check",
        path: ["Request", "authMiddleware", "policyCheck"],
        outcome: "Protected routes receive an authenticated user context."
      },
      followUps: [
        {
          id: "follow-up-tests",
          kind: "tests",
          label: "Inspect auth tests",
          description: "Open the auth middleware tests to confirm the happy path and failure paths.",
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
          fileRationale: "This file is the first protected-route touchpoint where authentication begins.",
          file: {
            path: "src/auth/middleware.ts"
          },
          location: {
            strategy: "range",
            range: {
              startLine: 3,
              startCharacter: 0,
              endLine: 12,
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
                endLine: 12,
                endCharacter: 0
              },
              summary: "Reads the incoming Authorization header.",
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
              summary: "Later policy enforcement depends on the middleware output.",
              symbols: ["requireRole"]
            }
          ],
          symbols: ["authMiddleware", "requireRole"],
          explanation: {
            title: "Start at the auth middleware",
            what: "This middleware extracts the bearer token.",
            why: "Every protected route passes through this entry point first.",
            how: "It reads the Authorization header and passes the parsed token downstream."
          },
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n",
          links: [
            {
              stepId: "walk-step-2",
              subrangeId: "service-validate",
              type: "calls",
              why: "The parsed token is handed off to the auth service.",
              viaSymbol: "resolveAuthenticatedUser"
            }
          ],
          branches: [
            {
              id: "missing-token",
              label: "Missing token",
              condition: "The Authorization header is missing or malformed.",
              outcome: "The request exits early with an unauthenticated response."
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
          fileRationale: "This file turns the raw token into a trusted user context for downstream guards.",
          file: {
            path: "src/auth/service.ts"
          },
          location: {
            strategy: "range",
            range: {
              startLine: 20,
              startCharacter: 0,
              endLine: 35,
              endCharacter: 0
            }
          },
          subranges: [
            {
              id: "service-validate",
              label: "Token validation",
              role: "primary",
              range: {
                startLine: 20,
                startCharacter: 0,
                endLine: 35,
                endCharacter: 0
              },
              summary: "Verifies the token and constructs the authenticated actor.",
              symbols: ["resolveAuthenticatedUser", "verifyToken"]
            }
          ],
          symbols: ["resolveAuthenticatedUser", "verifyToken"],
          explanation: {
            title: "Validate the token in the auth service",
            what: "This service verifies the token and produces the trusted user context.",
            why: "Later policy checks should only depend on verified identity data.",
            how: "The token is decoded and its claims are converted into the downstream actor object."
          },
          snippet:
            "export async function resolveAuthenticatedUser(token) {\n  const payload = await verifyToken(token);\n}\n"
        }
      ]
    });

    expect(result.question).toBe("How does authentication work in this backend?");
    expect(result.lens).toBe("permission_flow");
    expect(result.followUps).toHaveLength(1);
    expect(result.steps).toHaveLength(2);
    expect(result.flow?.path).toHaveLength(3);
    expect(result.steps[0]?.subranges).toHaveLength(2);
  });

  it("rejects a walkthrough session without question, how, or range", () => {
    const result = guidedSessionSchema.safeParse({
      id: "walkthrough-2",
      mode: "codebase_walkthrough",
      title: "Broken walkthrough",
      summary: "Missing required walkthrough fields.",
      createdAt: "2026-06-18T00:00:00.000Z",
      steps: [
        {
          id: "walk-step-1",
          order: 1,
          mode: "codebase_walkthrough",
          touchpoint: "entry",
          confidence: "direct",
          evidenceQuality: "high",
          fileRationale: "This file starts the auth walkthrough.",
          file: {
            path: "src/auth/middleware.ts"
          },
          location: {
            strategy: "line",
            line: 3
          },
          subranges: [
            {
              id: "bad-range",
              label: "Bad range",
              role: "context",
              range: {
                startLine: 3,
                startCharacter: 0,
                endLine: 5,
                endCharacter: 0
              }
            }
          ],
          explanation: {
            title: "Start at the auth middleware",
            what: "This middleware extracts the bearer token.",
            why: "Every protected route passes through this entry point first."
          },
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n"
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
