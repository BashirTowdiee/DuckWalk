import { z } from "zod";

export const sessionModeSchema = z.enum([
  "implementation",
  "pr_review",
  "codebase_walkthrough"
]);
export const stepStatusSchema = z.enum(["pending", "active", "complete", "skipped"]);

export const narrationSchema = z.object({
  short: z.string().min(1),
  detailed: z.string().min(1).optional()
});

export const stepExplanationSchema = z.object({
  title: z.string().min(1),
  what: z.string().min(1),
  why: z.string().min(1),
  how: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  risk: z.string().min(1).optional(),
  narration: narrationSchema.optional()
});

export const guidedFileTargetSchema = z.object({
  path: z.string().min(1),
  exists: z.boolean().optional(),
  createIfMissing: z.boolean().optional()
});

export const guidedRangeSchema = z.object({
  startLine: z.number().int().positive(),
  startCharacter: z.number().int().nonnegative().default(0),
  endLine: z.number().int().positive(),
  endCharacter: z.number().int().nonnegative().default(0)
});

export const guidedLocationSchema = z.object({
  strategy: z.enum(["create_file", "line", "range", "after_text", "before_text"]),
  line: z.number().int().positive().optional(),
  column: z.number().int().nonnegative().optional(),
  range: guidedRangeSchema.optional(),
  anchorText: z.string().min(1).optional()
});

export const walkthroughSubrangeRoleSchema = z.enum(["primary", "action", "context"]);
export const walkthroughLinkTypeSchema = z.enum([
  "calls",
  "returns",
  "guards",
  "dispatches",
  "reads",
  "writes",
  "configures",
  "emits"
]);
export const walkthroughTouchpointTypeSchema = z.enum([
  "entry",
  "guard",
  "read",
  "write",
  "transform",
  "emit",
  "respond",
  "config"
]);
export const walkthroughConfidenceSchema = z.enum(["direct", "mixed", "inferred"]);
export const walkthroughEvidenceQualitySchema = z.enum(["high", "medium", "low"]);
export const walkthroughLensSchema = z.enum([
  "request_flow",
  "data_flow",
  "permission_flow",
  "error_path",
  "config_dependency_flow"
]);
export const walkthroughFollowUpKindSchema = z.enum([
  "implementation",
  "tests",
  "config",
  "docs",
  "investigate"
]);

export const walkthroughSubrangeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: walkthroughSubrangeRoleSchema,
  range: guidedRangeSchema,
  summary: z.string().min(1).optional(),
  snippet: z.string().min(1).optional(),
  symbols: z.array(z.string().min(1)).min(1).optional()
});

export const walkthroughLinkSchema = z.object({
  stepId: z.string().min(1),
  subrangeId: z.string().min(1).optional(),
  type: walkthroughLinkTypeSchema,
  why: z.string().min(1),
  viaSymbol: z.string().min(1).optional()
});

export const walkthroughBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  condition: z.string().min(1),
  outcome: z.string().min(1),
  targetStepId: z.string().min(1).optional(),
  targetSubrangeId: z.string().min(1).optional()
});

export const walkthroughFlowSchema = z.object({
  summary: z.string().min(1),
  path: z.array(z.string().min(1)).min(2),
  entrypoint: z.string().min(1).optional(),
  outcome: z.string().min(1).optional()
});

export const walkthroughFollowUpSchema = z.object({
  id: z.string().min(1),
  kind: walkthroughFollowUpKindSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  stepId: z.string().min(1).optional(),
  file: z.string().min(1).optional()
});

export const stepValidationSchema = z.object({
  type: z.literal("normalised_match"),
  expectedText: z.string().optional(),
  scope: z.enum(["file", "range"]).optional()
});

export const reviewPlaybackSchema = z
  .object({
    beforeCode: z.string().optional(),
    afterCode: z.string().optional(),
    changedRange: guidedRangeSchema.optional()
  })
  .refine(
    (value) =>
      Boolean(value.beforeCode) || Boolean(value.afterCode) || Boolean(value.changedRange),
    {
      message: "review playback requires beforeCode, afterCode, or changedRange"
    }
  );

const baseStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  mode: sessionModeSchema,
  file: guidedFileTargetSchema,
  location: guidedLocationSchema,
  subranges: z.array(walkthroughSubrangeSchema).min(1).optional(),
  symbols: z.array(z.string().min(1)).min(1).optional(),
  explanation: stepExplanationSchema,
  validation: stepValidationSchema.optional(),
  status: stepStatusSchema.optional()
});

export const implementationStepSchema = baseStepSchema.extend({
  mode: z.literal("implementation"),
  ghostCode: z.string().min(1)
});

export const prReviewStepSchema = baseStepSchema.extend({
  mode: z.literal("pr_review"),
  review: reviewPlaybackSchema
});

export const codebaseWalkthroughStepSchema = baseStepSchema
  .extend({
    mode: z.literal("codebase_walkthrough"),
    touchpoint: walkthroughTouchpointTypeSchema,
    confidence: walkthroughConfidenceSchema,
    evidenceQuality: walkthroughEvidenceQualitySchema,
    fileRationale: z.string().min(1),
    snippet: z.string().min(1),
    links: z.array(walkthroughLinkSchema).optional(),
    branches: z.array(walkthroughBranchSchema).optional()
  })
  .superRefine((step, context) => {
    if (step.location.strategy !== "range" || !step.location.range) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "codebase walkthrough steps require a location range"
      });
    }

    if (!step.explanation.how) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["explanation", "how"],
        message: "codebase walkthrough steps require explanation.how"
      });
    }

    if (!step.subranges?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subranges"],
        message: "codebase walkthrough steps require named subranges"
      });
      return;
    }

    const primarySubranges = step.subranges.filter((subrange) => subrange.role === "primary");
    if (primarySubranges.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subranges"],
        message: "codebase walkthrough steps require exactly one primary subrange"
      });
    }
  });

export const guidedStepSchema = z.union([
  implementationStepSchema,
  prReviewStepSchema,
  codebaseWalkthroughStepSchema
]);

export const guidedSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: sessionModeSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    createdAt: z.string().min(1),
    question: z.string().min(1).optional(),
    lens: walkthroughLensSchema.optional(),
    flow: walkthroughFlowSchema.optional(),
    followUps: z.array(walkthroughFollowUpSchema).optional(),
    steps: z.array(guidedStepSchema).min(1)
  })
  .superRefine((session, context) => {
    if (session.mode === "codebase_walkthrough" && !session.question) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["question"],
        message: "codebase walkthrough sessions require a question"
      });
    }

    if (session.mode === "codebase_walkthrough" && !session.flow) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flow"],
        message: "codebase walkthrough sessions require a flow summary"
      });
    }

    if (session.mode === "codebase_walkthrough" && !session.lens) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lens"],
        message: "codebase walkthrough sessions require a lens"
      });
    }

    session.steps.forEach((step, index) => {
      if (step.mode !== session.mode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "mode"],
          message: `step mode ${step.mode} does not match session mode ${session.mode}`
        });
      }
    });
  });

export type SessionMode = z.infer<typeof sessionModeSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;
export type StepExplanation = z.infer<typeof stepExplanationSchema>;
export type GuidedFileTarget = z.infer<typeof guidedFileTargetSchema>;
export type GuidedRange = z.infer<typeof guidedRangeSchema>;
export type GuidedLocation = z.infer<typeof guidedLocationSchema>;
export type WalkthroughSubrangeRole = z.infer<typeof walkthroughSubrangeRoleSchema>;
export type WalkthroughLinkType = z.infer<typeof walkthroughLinkTypeSchema>;
export type WalkthroughTouchpointType = z.infer<typeof walkthroughTouchpointTypeSchema>;
export type WalkthroughConfidence = z.infer<typeof walkthroughConfidenceSchema>;
export type WalkthroughEvidenceQuality = z.infer<typeof walkthroughEvidenceQualitySchema>;
export type WalkthroughLens = z.infer<typeof walkthroughLensSchema>;
export type WalkthroughFollowUpKind = z.infer<typeof walkthroughFollowUpKindSchema>;
export type WalkthroughSubrange = z.infer<typeof walkthroughSubrangeSchema>;
export type WalkthroughLink = z.infer<typeof walkthroughLinkSchema>;
export type WalkthroughBranch = z.infer<typeof walkthroughBranchSchema>;
export type WalkthroughFlow = z.infer<typeof walkthroughFlowSchema>;
export type WalkthroughFollowUp = z.infer<typeof walkthroughFollowUpSchema>;
export type StepValidation = z.infer<typeof stepValidationSchema>;
export type ReviewPlayback = z.infer<typeof reviewPlaybackSchema>;
export type ImplementationStep = z.infer<typeof implementationStepSchema>;
export type PrReviewStep = z.infer<typeof prReviewStepSchema>;
export type CodebaseWalkthroughStep = z.infer<typeof codebaseWalkthroughStepSchema>;
export type GuidedStep = z.infer<typeof guidedStepSchema>;
export type GuidedSession = z.infer<typeof guidedSessionSchema>;
