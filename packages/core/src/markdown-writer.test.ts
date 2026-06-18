import { describe, expect, it } from "vitest";

import type { GuidedSession } from "@duckwalk/schema";

import { renderSessionMarkdown } from "./markdown-writer";

const walkthroughSession: GuidedSession = {
  id: "auth-walkthrough",
  mode: "codebase_walkthrough",
  title: "Trace authentication flow",
  summary: "Shows how authentication moves through middleware and policy checks.",
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
          endLine: 10,
          endCharacter: 0
        }
      },
      explanation: {
        title: "Begin in the middleware",
        what: "The middleware reads the bearer token.",
        why: "Every protected request hits this entry point first.",
        how: "The request header is parsed before control moves into the auth service."
      },
      snippet:
        "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n}\n"
    }
  ]
};

describe("renderSessionMarkdown", () => {
  it("renders question-driven walkthrough sessions with how and snippet sections", () => {
    const markdown = renderSessionMarkdown(walkthroughSession);

    expect(markdown).toContain("Question: How does authentication work in this backend?");
    expect(markdown).toContain("- How: The request header is parsed before control moves into the auth service.");
    expect(markdown).toContain("### Snippet");
    expect(markdown).toContain("src/auth/middleware.ts");
  });
});
