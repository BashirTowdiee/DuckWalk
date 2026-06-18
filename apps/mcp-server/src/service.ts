import {
  guidedSessionStateSchema,
  readGuidedSession,
  readGuidedState,
  updateGuidedStepStatus,
  validateSessionIntegrity,
  writeRecipeFiles
} from "@duckwalk/core";
import {
  sessionModeSchema,
  codebaseWalkthroughStepSchema,
  guidedSessionSchema,
  stepStatusSchema,
  type GuidedSession,
  type SessionMode,
  type StepStatus
} from "@duckwalk/schema";
import { z } from "zod";

const updateStepStatusInputSchema = z.object({
  sessionId: z.string().min(1),
  stepId: z.string().min(1),
  status: stepStatusSchema
});

const validateGuidedSessionInputSchema = z.object({
  session: guidedSessionSchema,
  expectMode: sessionModeSchema.optional()
});

export type CreateGuidedSessionResult = {
  sessionId: string;
  recipePath: string;
  markdownPath: string;
  statePath: string;
};

export function getDuckWalkContract() {
  return {
    server: {
      name: "duckwalk-mcp",
      version: "0.1.0"
    },
    guidance: {
      summary:
        "Use this contract instead of searching the duckWalk repo or the user's home directory for examples.",
      workspaceRoot:
        "Always pass workspaceRoot as the absolute target task workspace path when creating, reading, or updating guided sessions.",
      gitignore:
        "Session creation automatically adds .guided-implementation/ to the target workspace .gitignore when no equivalent ignore rule already exists.",
      commentStyle:
        "For functions or non-trivial logic in ghostCode, include short pragmatic comments that say what the code does. Only use an `Important:` comment when the behavior is safety-critical, stateful, or easy to misuse.",
      recommendedFlow: [
        "Inspect only the current task workspace to choose file targets.",
        "Call get_duckwalk_contract when you need the session shape or examples.",
        "Call create_guided_session for implementation playback or create_pr_review_session for review playback.",
        "Call pathfinder for question-driven codebase walkthroughs that explain architecture flow.",
        "Only call get_guided_session when you explicitly need current session data.",
        "Only call update_step_status when the user explicitly wants step state changed from Codex."
      ]
    },
    tools: {
      get_duckwalk_contract: {
        description: "Returns the duckWalk contract, rules, and example payloads."
      },
      create_guided_session: {
        description: "Validate and persist an implementation guided session.",
        input: {
          workspaceRoot: "string, absolute path, recommended",
          session: "GuidedSession with mode implementation"
        }
      },
      create_pr_review_session: {
        description: "Validate and persist a PR review guided session.",
        input: {
          workspaceRoot: "string, absolute path, recommended",
          session: "GuidedSession with mode pr_review"
        }
      },
      pathfinder: {
        description:
          "Validate and persist a question-driven codebase walkthrough guided session.",
        input: {
          workspaceRoot: "string, absolute path, recommended",
          session: "GuidedSession with mode codebase_walkthrough"
        }
      },
      get_guided_session: {
        description: "Read the current session or a specific session by ID.",
        input: {
          workspaceRoot: "string, absolute path, recommended",
          sessionId: "optional string"
        }
      },
      update_step_status: {
        description: "Update one step status in the current guided session state.",
        input: {
          workspaceRoot: "string, absolute path, recommended",
          sessionId: "string",
          stepId: "string",
          status: ["pending", "active", "complete", "skipped"]
        }
      }
    },
    schema: {
      sessionModes: ["implementation", "pr_review", "codebase_walkthrough"],
      implementationStepRequiredFields: [
        "id",
        "order",
        "mode",
        "file",
        "location",
        "explanation",
        "ghostCode"
      ],
      prReviewStepRequiredFields: [
        "id",
        "order",
        "mode",
        "file",
        "location",
        "explanation",
        "review"
      ],
      codebaseWalkthroughRequiredFields: [
        "question",
        "id",
        "order",
        "mode",
        "file",
        "location",
        "explanation",
        "snippet"
      ],
      guidedFileTargetFields: ["path", "exists?", "createIfMissing?"],
      locationStrategies: ["create_file", "line", "range", "after_text", "before_text"],
      explanationFields: ["title", "what", "why", "how?", "impact?", "risk?", "narration?"],
      validation: {
        default: {
          type: "normalised_match"
        },
        optionalFields: ["expectedText", "scope"]
      },
      prReviewRangeRule:
        "Each pr_review step must include a usable range through location.range or review.changedRange.",
      codebaseWalkthroughRangeRule:
        "Each codebase_walkthrough step must include location.strategy = range and a usable location.range."
    },
    examples: {
      create_guided_session: {
        workspaceRoot: "/absolute/path/to/task/workspace",
        session: {
          id: "feature-auth-middleware",
          mode: "implementation",
          title: "Create auth middleware",
          summary: "Adds a reusable auth middleware and wires it into routes.",
          createdAt: "2026-06-18T00:00:00.000Z",
          steps: [
            {
              id: "step-1",
              order: 1,
              mode: "implementation",
              file: {
                path: "src/middleware/auth.ts",
                createIfMissing: true
              },
              location: {
                strategy: "create_file"
              },
              explanation: {
                title: "Create the auth middleware",
                what: "Adds a reusable authorization middleware.",
                why: "Route handlers should not repeat auth checks."
              },
              ghostCode:
                "import type { FastifyReply, FastifyRequest } from 'fastify';\n\n// Rejects unauthenticated requests before route handlers run.\nexport async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {\n  const authHeader = request.headers.authorization;\n\n  // Important: fail fast so protected handlers never run without auth.\n  if (!authHeader) {\n    return reply.code(401).send({ error: 'Missing authorization header' });\n  }\n}\n",
              validation: {
                type: "normalised_match"
              }
            }
          ]
        }
      },
      create_pr_review_session: {
        workspaceRoot: "/absolute/path/to/task/workspace",
        session: {
          id: "review-auth-middleware",
          mode: "pr_review",
          title: "Review auth middleware changes",
          summary: "Walks through the middleware and route wiring changes.",
          createdAt: "2026-06-18T00:00:00.000Z",
          steps: [
            {
              id: "review-step-1",
              order: 1,
              mode: "pr_review",
              file: {
                path: "src/middleware/auth.ts"
              },
              location: {
                strategy: "range",
                range: {
                  startLine: 1,
                  startCharacter: 0,
                  endLine: 12,
                  endCharacter: 0
                }
              },
              explanation: {
                title: "Review the middleware implementation",
                what: "Adds a reusable auth check.",
                why: "Routes should fail fast before business logic.",
                impact: "Protected handlers now reject missing authorization headers."
              },
              review: {
                beforeCode: "",
                afterCode: "export async function authMiddleware() {}\n",
                changedRange: {
                  startLine: 1,
                  startCharacter: 0,
                  endLine: 12,
                  endCharacter: 0
                }
              }
            }
          ]
        }
      },
      pathfinder: {
        workspaceRoot: "/absolute/path/to/task/workspace",
        session: {
          id: "walkthrough-authentication-flow",
          mode: "codebase_walkthrough",
          title: "Trace backend authentication flow",
          summary: "Shows how a protected request moves from middleware into token validation.",
          question: "How does authentication work in this backend project?",
          createdAt: "2026-06-18T00:00:00.000Z",
          steps: [
            {
              id: "walkthrough-step-1",
              order: 1,
              mode: "codebase_walkthrough",
              file: {
                path: "src/auth/middleware.ts"
              },
              location: {
                strategy: "range",
                range: {
                  startLine: 1,
                  startCharacter: 0,
                  endLine: 12,
                  endCharacter: 0
                }
              },
              explanation: {
                title: "Start at the auth middleware",
                what: "This middleware extracts the bearer token from the request.",
                why: "Every protected route enters the authentication flow here.",
                how: "The request header is parsed and the token is passed to the downstream auth service.",
                impact: "Requests without a token fail before route handlers run."
              },
              snippet:
                "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n  const token = authHeader?.replace('Bearer ', '');\n}\n"
            }
          ]
        }
      }
    }
  };
}

export function validateGuidedSessionInput(input: {
  session: GuidedSession;
  expectMode?: SessionMode;
}) {
  const payload = validateGuidedSessionInputSchema.parse(input);
  const session = guidedSessionSchema.parse(payload.session);

  if (payload.expectMode && session.mode !== payload.expectMode) {
    throw new Error(`Expected session mode "${payload.expectMode}" but received "${session.mode}"`);
  }

  validateSessionIntegrity(session);
  if (session.mode === "pr_review") {
    validatePrReviewStepRanges(session);
  }
  if (session.mode === "codebase_walkthrough") {
    validateCodebaseWalkthroughStepRanges(session);
  }

  return {
    valid: true,
    session: {
      id: session.id,
      mode: session.mode,
      title: session.title,
      summary: session.summary,
      stepCount: session.steps.length,
      files: session.steps.map((step) => step.file.path),
      locationStrategies: [...new Set(session.steps.map((step) => step.location.strategy))]
    }
  };
}

function validatePrReviewStepRanges(session: GuidedSession) {
  for (const step of session.steps) {
    if (
      step.mode !== "pr_review" ||
      ((step.location.strategy !== "range" || !step.location.range) && !step.review.changedRange)
    ) {
      throw new Error(
        `PR review step ${step.id} requires a location range or review.changedRange`
      );
    }
  }
}

function validateCodebaseWalkthroughStepRanges(session: GuidedSession) {
  for (const step of session.steps) {
    if (
      step.mode !== "codebase_walkthrough" ||
      step.location.strategy !== "range" ||
      !step.location.range
    ) {
      throw new Error(`Codebase walkthrough step ${step.id} requires a location range`);
    }

    codebaseWalkthroughStepSchema.parse(step);
  }
}

async function isCurrentSession(rootDir: string, sessionId: string): Promise<boolean> {
  try {
    const currentSession = await readGuidedSession(rootDir);
    return currentSession.id === sessionId;
  } catch {
    return false;
  }
}

export async function createGuidedSession(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);
  validateSessionIntegrity(session);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function createPrReviewSession(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);

  if (session.mode !== "pr_review") {
    throw new Error('create_pr_review_session requires mode "pr_review"');
  }

  validateSessionIntegrity(session);
  validatePrReviewStepRanges(session);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function pathfinder(
  rootDir: string,
  sessionInput: GuidedSession
): Promise<CreateGuidedSessionResult> {
  const session = guidedSessionSchema.parse(sessionInput);

  if (session.mode !== "codebase_walkthrough") {
    throw new Error('pathfinder requires mode "codebase_walkthrough"');
  }

  validateSessionIntegrity(session);
  validateCodebaseWalkthroughStepRanges(session);
  const files = await writeRecipeFiles(rootDir, session);

  return {
    sessionId: session.id,
    recipePath: files.recipePath,
    markdownPath: files.markdownPath,
    statePath: files.statePath
  };
}

export async function getGuidedSession(rootDir: string, sessionId?: string) {
  const session = guidedSessionSchema.parse(await readGuidedSession(rootDir, sessionId));
  let state = await readGuidedState(rootDir, sessionId);

  if (!state && sessionId && (await isCurrentSession(rootDir, sessionId))) {
    state = await readGuidedState(rootDir);
  }

  return {
    session,
    state: state ? guidedSessionStateSchema.parse(state) : null
  };
}

export async function updateStepStatus(
  rootDir: string,
  input: { sessionId: string; stepId: string; status: StepStatus }
) {
  const payload = updateStepStatusInputSchema.parse(input);
  const session = guidedSessionSchema.parse(await readGuidedSession(rootDir, payload.sessionId));

  if (session.id !== payload.sessionId) {
    throw new Error(`Session mismatch for ${payload.sessionId}`);
  }

  const state = await updateGuidedStepStatus(
    rootDir,
    session,
    payload.stepId,
    payload.status,
    {
      writeCurrent: await isCurrentSession(rootDir, session.id)
    }
  );

  return {
    sessionId: session.id,
    stepId: payload.stepId,
    status: payload.status,
    state: guidedSessionStateSchema.parse(state)
  };
}
