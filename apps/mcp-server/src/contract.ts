export function getDuckWalkContract() {
  return {
    server: {
      name: "duckwalk-mcp",
      version: "0.1.4"
    },
    guidance: {
      summary:
        "Use this contract instead of searching the duckWalk repo or the user's home directory for examples.",
      workspaceRoot:
        "Always pass workspaceRoot as the absolute target task workspace path when creating, reading, or updating guided sessions.",
      gitignore:
        "duckWalk writes .guided-implementation files into the target workspace without modifying .gitignore, and create-session results include a ready-to-apply ignore suggestion.",
      commentStyle:
        "For functions or non-trivial logic in ghostCode, include short pragmatic comments that say what the code does. Only use an `Important:` comment when the behavior is safety-critical, stateful, or easy to misuse.",
      pathfinderAuthoringHints: [
        "Start at the real entrypoint for the user's question, such as middleware, controller, route, job handler, or event subscriber.",
        "Follow calls, hooks, guards, and data handoffs in execution order until the question is answered.",
        "Use one step per touchpoint, not one step per file.",
        "Use named subranges so the walkthrough can distinguish action ranges from supporting context.",
        "Fill step links explicitly so the graph and story can show why control moves to the next touchpoint."
      ],
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
        "lens",
        "flow",
        "id",
        "order",
        "mode",
        "touchpoint",
        "confidence",
        "evidenceQuality",
        "fileRationale",
        "file",
        "location",
        "explanation",
        "snippet",
        "subranges"
      ],
      walkthroughFlowFields: ["summary", "path", "entrypoint?", "outcome?"],
      walkthroughSubrangeFields: [
        "id",
        "label",
        "role",
        "range",
        "summary?",
        "snippet?",
        "symbols?"
      ],
      walkthroughLinkFields: ["stepId", "subrangeId?", "type", "why", "viaSymbol?"],
      walkthroughBranchFields: [
        "id",
        "label",
        "condition",
        "outcome",
        "targetStepId?",
        "targetSubrangeId?"
      ],
      walkthroughFollowUpFields: ["id", "kind", "label", "description", "stepId?", "file?"],
      optionalStepFields: ["links?", "branches?", "symbols?"],
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
        "Each codebase_walkthrough step must include location.strategy = range and a usable location.range.",
      codebaseWalkthroughSubrangeRules: [
        "Each codebase_walkthrough step must include named subranges.",
        "Exactly one subrange must use role primary and it must match location.range.",
        "Additional subranges should usually use role action or context.",
        "Subrange IDs and ranges must be unique within the step.",
        "Links must point to real step IDs in the same walkthrough.",
        "When links or branches target subranges, the target subrange ID must exist on the target step."
      ]
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
          lens: "permission_flow",
          flow: {
            summary: "Request -> auth middleware -> auth service -> route guard",
            path: ["Request", "authMiddleware", "resolveAuthenticatedUser", "requireRole"],
            entrypoint: "HTTP request to a protected route",
            outcome: "Only authenticated requests with the right role reach the handler."
          },
          followUps: [
            {
              id: "follow-up-tests",
              kind: "tests",
              label: "Inspect auth tests",
              description: "Open the middleware tests to confirm the success path and failure branches.",
              file: "tests/auth/middleware.test.ts"
            }
          ],
          createdAt: "2026-06-18T00:00:00.000Z",
          steps: [
            {
              id: "walkthrough-step-1",
              order: 1,
              mode: "codebase_walkthrough",
              touchpoint: "entry",
              confidence: "direct",
              evidenceQuality: "high",
              fileRationale:
                "This file is the first protected-route touchpoint where authentication begins.",
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
              subranges: [
                {
                  id: "middleware-entry",
                  label: "Middleware entry",
                  role: "primary",
                  range: {
                    startLine: 1,
                    startCharacter: 0,
                    endLine: 12,
                    endCharacter: 0
                  },
                  summary: "Reads the Authorization header and extracts the bearer token.",
                  symbols: ["authMiddleware"]
                },
                {
                  id: "downstream-policy-context",
                  label: "Downstream policy context",
                  role: "context",
                  range: {
                    startLine: 130,
                    startCharacter: 0,
                    endLine: 190,
                    endCharacter: 0
                  },
                  summary: "Later role checks depend on the authenticated user injected here.",
                  symbols: ["requireRole"]
                }
              ],
              symbols: ["authMiddleware", "resolveAuthenticatedUser", "requireRole"],
              explanation: {
                title: "Start at the auth middleware",
                what: "This middleware extracts the bearer token from the request.",
                why: "Every protected route enters the authentication flow here.",
                how: "The request header is parsed and the token is passed to the downstream auth service.",
                impact: "Requests without a token fail before route handlers run."
              },
              snippet:
                "export async function authMiddleware(request, reply) {\n  const authHeader = request.headers.authorization;\n  const token = authHeader?.replace('Bearer ', '');\n}\n",
              links: [
                {
                  stepId: "walkthrough-step-2",
                  subrangeId: "token-validate",
                  type: "calls",
                  why: "The extracted token is validated by the auth service before the request can continue.",
                  viaSymbol: "resolveAuthenticatedUser"
                }
              ],
              branches: [
                {
                  id: "missing-token",
                  label: "Missing token",
                  condition: "The Authorization header is missing or malformed.",
                  outcome: "The request fails before the route handler runs."
                },
                {
                  id: "success-path",
                  label: "Success path",
                  condition: "A bearer token is present.",
                  outcome: "The request continues into the token validation step.",
                  targetStepId: "walkthrough-step-2",
                  targetSubrangeId: "token-validate"
                }
              ]
            },
            {
              id: "walkthrough-step-2",
              order: 2,
              mode: "codebase_walkthrough",
              touchpoint: "transform",
              confidence: "direct",
              evidenceQuality: "high",
              fileRationale:
                "This file turns the raw token into a trusted identity object for downstream guards.",
              file: {
                path: "src/auth/service.ts"
              },
              location: {
                strategy: "range",
                range: {
                  startLine: 10,
                  startCharacter: 0,
                  endLine: 24,
                  endCharacter: 0
                }
              },
              subranges: [
                {
                  id: "token-validate",
                  label: "Token validation",
                  role: "primary",
                  range: {
                    startLine: 10,
                    startCharacter: 0,
                    endLine: 24,
                    endCharacter: 0
                  },
                  summary: "Verifies the token and resolves the authenticated user.",
                  symbols: ["resolveAuthenticatedUser", "verifyToken"]
                }
              ],
              symbols: ["resolveAuthenticatedUser", "verifyToken"],
              explanation: {
                title: "Validate the token and resolve the user",
                what: "The auth service verifies the token and builds the authenticated user context.",
                why: "Downstream guards can only make authorization decisions from a trusted identity.",
                how: "The token verifier decodes claims and returns a resolved actor for later guards."
              },
              snippet:
                "export async function resolveAuthenticatedUser(token) {\n  const payload = await verifyToken(token);\n  return { userId: payload.sub, roles: payload.roles };\n}\n"
            }
          ]
        }
      }
    }
  };
}
