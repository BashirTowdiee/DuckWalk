import path from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  createGuidedSession,
  createPrReviewSession,
  getDuckWalkContract,
  getGuidedSession,
  pathfinder,
  updateStepStatus,
  validateGuidedSessionInput
} from "./service";

const rootDir = process.env.DUCKWALK_ROOT ?? process.cwd();

const server = new Server(
  {
    name: "duckwalk-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function getArguments(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    return {};
  }
  return input as Record<string, unknown>;
}

function resolveTargetRoot(args: Record<string, unknown>): string {
  const workspaceRoot = args.workspaceRoot;
  if (typeof workspaceRoot === "string" && workspaceRoot.trim().length > 0) {
    return path.resolve(workspaceRoot);
  }

  return rootDir;
}

function resolveExpectedMode(
  value: unknown
): Parameters<typeof validateGuidedSessionInput>[0]["expectMode"] {
  return value === "implementation" ||
    value === "pr_review" ||
    value === "codebase_walkthrough"
    ? value
    : undefined;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_duckwalk_contract",
      description:
        "Return the duckWalk session contract, rules, and example payloads for Codex.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "validate_guided_session",
      description:
        "Validate a GuidedSession payload without writing files, and return a normalized summary.",
      inputSchema: {
        type: "object",
        properties: {
          session: {
            type: "object",
            description: "A full GuidedSession payload."
          },
          expectMode: {
            type: "string",
            enum: ["implementation", "pr_review", "codebase_walkthrough"],
            description: "Optional expected mode check for the session."
          }
        },
        required: ["session"]
      }
    },
    {
      name: "create_guided_session",
      description: "Validate and persist an implementation guided session.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description:
              "Optional absolute workspace root where .guided-implementation files should be written."
          },
          session: {
            type: "object",
            description: "A full GuidedSession payload."
          }
        },
        required: ["session"]
      }
    },
    {
      name: "create_pr_review_session",
      description: "Validate and persist a PR review guided session.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description:
              "Optional absolute workspace root where .guided-implementation files should be written."
          },
          session: {
            type: "object",
            description: "A full GuidedSession payload with mode pr_review."
          }
        },
        required: ["session"]
      }
    },
    {
      name: "pathfinder",
      description: "Validate and persist a question-driven codebase walkthrough session.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description:
              "Optional absolute workspace root where .guided-implementation files should be written."
          },
          session: {
            type: "object",
            description: "A full GuidedSession payload with mode codebase_walkthrough."
          }
        },
        required: ["session"]
      }
    },
    {
      name: "get_guided_session",
      description: "Read the current session or a specific session by ID.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description:
              "Optional absolute workspace root where the guided session should be read."
          },
          sessionId: {
            type: "string"
          }
        }
      }
    },
    {
      name: "update_step_status",
      description: "Update one step status in the current guided session state.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description:
              "Optional absolute workspace root where the guided session state should be updated."
          },
          sessionId: {
            type: "string"
          },
          stepId: {
            type: "string"
          },
          status: {
            type: "string",
            enum: ["pending", "active", "complete", "skipped"]
          }
        },
        required: ["sessionId", "stepId", "status"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = getArguments(request.params.arguments);
  const targetRoot = resolveTargetRoot(args);

  switch (request.params.name) {
    case "get_duckwalk_contract":
      return textResult(getDuckWalkContract());
    case "validate_guided_session":
      {
        const expectMode = resolveExpectedMode(args.expectMode);
        const payload = {
          session: args.session as Parameters<typeof validateGuidedSessionInput>[0]["session"],
          ...(expectMode ? { expectMode } : {})
        };

        return textResult(validateGuidedSessionInput(payload));
      }
    case "create_guided_session":
      return textResult(
        await createGuidedSession(
          targetRoot,
          args.session as Parameters<typeof createGuidedSession>[1]
        )
      );
    case "create_pr_review_session":
      return textResult(
        await createPrReviewSession(
          targetRoot,
          args.session as Parameters<typeof createPrReviewSession>[1]
        )
      );
    case "pathfinder":
      return textResult(
        await pathfinder(targetRoot, args.session as Parameters<typeof pathfinder>[1])
      );
    case "get_guided_session":
      return textResult(
        await getGuidedSession(
          targetRoot,
          typeof args.sessionId === "string" ? args.sessionId : undefined
        )
      );
    case "update_step_status":
      return textResult(
        await updateStepStatus(targetRoot, {
          sessionId: String(args.sessionId),
          stepId: String(args.stepId),
          status: args.status as Parameters<typeof updateStepStatus>[1]["status"]
        })
      );
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[duckwalk-mcp] fatal error");
  console.error(error);
  process.exit(1);
});
