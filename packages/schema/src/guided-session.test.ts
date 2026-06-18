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
      createdAt: "2026-06-18T00:00:00.000Z",
      steps: [
        {
          id: "walk-step-1",
          order: 1,
          mode: "codebase_walkthrough",
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
          explanation: {
            title: "Start at the auth middleware",
            what: "This middleware extracts the bearer token.",
            why: "Every protected route passes through this entry point first.",
            how: "It reads the Authorization header and passes the parsed token downstream."
          },
          snippet:
            "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n"
        }
      ]
    });

    expect(result.question).toBe("How does authentication work in this backend?");
    expect(result.steps).toHaveLength(1);
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
          file: {
            path: "src/auth/middleware.ts"
          },
          location: {
            strategy: "line",
            line: 3
          },
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
