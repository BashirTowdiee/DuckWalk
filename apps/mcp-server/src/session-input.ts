import {
  guidedSessionSchema,
  walkthroughConfidenceSchema,
  walkthroughEvidenceQualitySchema,
  walkthroughFollowUpKindSchema,
  walkthroughLensSchema,
  walkthroughLinkTypeSchema,
  walkthroughSubrangeRoleSchema,
  walkthroughTouchpointTypeSchema,
  type GuidedSession
} from "@duckwalk/schema";
import { ZodError, type ZodIssue } from "zod";

type EnumOptions = readonly string[];
type MutableSessionDraft = Record<string, unknown> & {
  mode?: unknown;
  lens?: unknown;
  followUps?: unknown[];
  steps?: unknown[];
};

const walkthroughTouchpointAliases = {
  endpoint: "entry",
  entry_point: "entry",
  entrypoint: "entry",
  handler: "entry",
  route: "entry",
  validation: "guard",
  validate: "guard",
  checks: "guard",
  check: "guard",
  fetch: "read",
  fetches: "read",
  load: "read",
  loads: "read",
  query: "read",
  queries: "read",
  persist: "write",
  persists: "write",
  save: "write",
  saves: "write",
  store: "write",
  stores: "write",
  upsert: "write",
  update: "write",
  derive: "transform",
  derives: "transform",
  normalize: "transform",
  normalizes: "transform",
  parse: "transform",
  parses: "transform",
  build: "transform",
  builds: "transform",
  send: "emit",
  sends: "emit",
  publish: "emit",
  publishes: "emit",
  log: "emit",
  logs: "emit",
  reply: "respond",
  response: "respond",
  return: "respond",
  returns: "respond",
  config_dependency: "config",
  configuration: "config",
  settings: "config"
} as const;

const walkthroughLinkTypeAliases = {
  call: "calls",
  invokes: "calls",
  invoke: "calls",
  uses: "calls",
  delegates: "calls",
  delegate: "calls",
  handoff: "dispatches",
  routes_to: "dispatches",
  route_to: "dispatches",
  forwards: "dispatches",
  forward: "dispatches",
  guard: "guards",
  checks: "guards",
  check: "guards",
  validates: "guards",
  validate: "guards",
  read: "reads",
  loads: "reads",
  load: "reads",
  fetches: "reads",
  fetch: "reads",
  queries: "reads",
  query: "reads",
  write: "writes",
  stores: "writes",
  store: "writes",
  persists: "writes",
  persist: "writes",
  upserts: "writes",
  upsert: "writes",
  configure: "configures",
  config: "configures",
  depends_on: "configures",
  wires: "configures",
  wire: "configures",
  emit: "emits",
  sends: "emits",
  send: "emits",
  publishes: "emits",
  publish: "emits",
  logs: "emits",
  log: "emits"
} as const;

const walkthroughFollowUpKindAliases = {
  test: "tests",
  testing: "tests",
  documentation: "docs",
  readme: "docs",
  doc: "docs",
  code: "implementation",
  changes: "implementation",
  investigate_more: "investigate",
  investigation: "investigate",
  settings: "config"
} as const;

const walkthroughLensAliases = {
  permissions: "permission_flow",
  permission: "permission_flow",
  auth_flow: "permission_flow",
  request: "request_flow",
  requests: "request_flow",
  data: "data_flow",
  error: "error_path",
  errors: "error_path",
  config: "config_dependency_flow",
  configuration: "config_dependency_flow"
} as const;

const walkthroughConfidenceAliases = {
  certain: "direct",
  exact: "direct",
  confirmed: "direct",
  partial: "mixed",
  blended: "mixed",
  uncertain: "inferred",
  speculative: "inferred",
  guessed: "inferred"
} as const;

const walkthroughEvidenceQualityAliases = {
  strong: "high",
  solid: "high",
  moderate: "medium",
  partial: "medium",
  weak: "low",
  thin: "low"
} as const;

const walkthroughSubrangeRoleAliases = {
  supporting: "context",
  support: "context",
  secondary: "context",
  evidence: "primary",
  main: "primary",
  focus: "primary"
} as const;

function normalizeEnumKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  aliases: Record<string, T>
) {
  if (typeof value !== "string") {
    return value;
  }

  const normalizedValue = normalizeEnumKey(value);
  const directMatch = allowedValues.find(
    (allowedValue) => normalizeEnumKey(allowedValue) === normalizedValue
  );
  if (directMatch) {
    return directMatch;
  }

  return aliases[normalizedValue] ?? value;
}

function normalizeWalkthroughSession(sessionInput: unknown): unknown {
  if (!sessionInput || typeof sessionInput !== "object") {
    return sessionInput;
  }

  const session = structuredClone(sessionInput) as MutableSessionDraft;
  if (session.mode !== "codebase_walkthrough") {
    return session;
  }

  session.lens = normalizeEnumValue(
    session.lens,
    walkthroughLensSchema.options,
    walkthroughLensAliases
  );

  if (Array.isArray(session.followUps)) {
    session.followUps = session.followUps.map((followUp) => {
      if (!followUp || typeof followUp !== "object") {
        return followUp;
      }

      const followUpDraft = followUp as Record<string, unknown>;
      return {
        ...followUpDraft,
        kind: normalizeEnumValue(
          followUpDraft.kind,
          walkthroughFollowUpKindSchema.options,
          walkthroughFollowUpKindAliases
        )
      };
    });
  }

  if (Array.isArray(session.steps)) {
    session.steps = session.steps.map((step) => {
      if (!step || typeof step !== "object") {
        return step;
      }

      const stepDraft = step as Record<string, unknown>;
      if (stepDraft.mode !== "codebase_walkthrough") {
        return stepDraft;
      }

      return {
        ...stepDraft,
        touchpoint: normalizeEnumValue(
          stepDraft.touchpoint,
          walkthroughTouchpointTypeSchema.options,
          walkthroughTouchpointAliases
        ),
        confidence: normalizeEnumValue(
          stepDraft.confidence,
          walkthroughConfidenceSchema.options,
          walkthroughConfidenceAliases
        ),
        evidenceQuality: normalizeEnumValue(
          stepDraft.evidenceQuality,
          walkthroughEvidenceQualitySchema.options,
          walkthroughEvidenceQualityAliases
        ),
        subranges: Array.isArray(stepDraft.subranges)
          ? stepDraft.subranges.map((subrange) => {
              if (!subrange || typeof subrange !== "object") {
                return subrange;
              }

              const subrangeDraft = subrange as Record<string, unknown>;
              return {
                ...subrangeDraft,
                role: normalizeEnumValue(
                  subrangeDraft.role,
                  walkthroughSubrangeRoleSchema.options,
                  walkthroughSubrangeRoleAliases
                )
              };
            })
          : stepDraft.subranges,
        links: Array.isArray(stepDraft.links)
          ? stepDraft.links.map((link) => {
              if (!link || typeof link !== "object") {
                return link;
              }

              const linkDraft = link as Record<string, unknown>;
              return {
                ...linkDraft,
                type: normalizeEnumValue(
                  linkDraft.type,
                  walkthroughLinkTypeSchema.options,
                  walkthroughLinkTypeAliases
                )
              };
            })
          : stepDraft.links
      };
    });
  }

  return session;
}

function flattenIssues(issues: ZodIssue[]): ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== "invalid_union" || !("unionErrors" in issue)) {
      return [issue];
    }

    return issue.unionErrors.flatMap((unionError) => flattenIssues(unionError.issues));
  });
}

function formatIssuePath(path: Array<string | number>) {
  return path.reduce((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }

    return formatted ? `${formatted}.${segment}` : segment;
  }, "");
}

function formatAllowedValues(issue: {
  options?: readonly string[] | undefined;
  expected?: EnumOptions | string | undefined;
}) {
  if (Array.isArray(issue.options) && issue.options.length > 0) {
    return issue.options;
  }

  if (Array.isArray(issue.expected) && issue.expected.length > 0) {
    return issue.expected;
  }

  return null;
}

function formatGuidedSessionError(error: unknown): never {
  if (!(error instanceof ZodError)) {
    throw error;
  }

  const formattedIssues = flattenIssues(error.issues).map((issue) => {
    const path = formatIssuePath(issue.path);
    const received =
      "received" in issue && issue.received !== undefined ? ` Received: ${JSON.stringify(issue.received)}.` : "";
    const allowedValues = formatAllowedValues(
      issue as ZodIssue & { options?: readonly string[]; expected?: EnumOptions | string }
    );
    const allowedMessage = allowedValues
      ? ` Allowed values: ${allowedValues.join(", ")}.`
      : "";

    return `- ${path || "session"}: ${issue.message}.${allowedMessage}${received}`.replace(
      /\.\./g,
      "."
    );
  });

  throw new Error(`Guided session validation failed:\n${formattedIssues.join("\n")}`);
}

export function parseGuidedSessionInput(sessionInput: unknown): GuidedSession {
  try {
    return guidedSessionSchema.parse(normalizeWalkthroughSession(sessionInput));
  } catch (error) {
    formatGuidedSessionError(error);
  }
}
