import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  createGuidedSession,
  createPrReviewSession,
  getGuidedSession,
  updateStepStatus
} from "./service";

const rootDir = process.env.GUIDEDPATCH_ROOT ?? process.cwd();

const server = new Server(
  {
    name: "guidedpatch-mcp",
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_guided_session",
      description: "Validate and persist an implementation guided session.",
      inputSchema: {
        type: "object",
        properties: {
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
          session: {
            type: "object",
            description: "A full GuidedSession payload with mode pr_review."
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

  switch (request.params.name) {
    case "create_guided_session":
      return textResult(
        await createGuidedSession(rootDir, args.session as Parameters<typeof createGuidedSession>[1])
      );
    case "create_pr_review_session":
      return textResult(
        await createPrReviewSession(
          rootDir,
          args.session as Parameters<typeof createPrReviewSession>[1]
        )
      );
    case "get_guided_session":
      return textResult(
        await getGuidedSession(
          rootDir,
          typeof args.sessionId === "string" ? args.sessionId : undefined
        )
      );
    case "update_step_status":
      return textResult(
        await updateStepStatus(rootDir, {
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
  console.error("[guidedpatch-mcp] fatal error");
  console.error(error);
  process.exit(1);
});
