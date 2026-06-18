import { z } from "zod";

export const sessionModeSchema = z.enum(["implementation", "pr_review"]);
export const stepStatusSchema = z.enum(["pending", "active", "complete", "skipped"]);

export const narrationSchema = z.object({
  short: z.string().min(1),
  detailed: z.string().min(1).optional()
});

export const stepExplanationSchema = z.object({
  title: z.string().min(1),
  what: z.string().min(1),
  why: z.string().min(1),
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

export const guidedStepSchema = z.union([implementationStepSchema, prReviewStepSchema]);

export const guidedSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: sessionModeSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    createdAt: z.string().min(1),
    steps: z.array(guidedStepSchema).min(1)
  })
  .superRefine((session, context) => {
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
export type StepValidation = z.infer<typeof stepValidationSchema>;
export type ReviewPlayback = z.infer<typeof reviewPlaybackSchema>;
export type ImplementationStep = z.infer<typeof implementationStepSchema>;
export type PrReviewStep = z.infer<typeof prReviewStepSchema>;
export type GuidedStep = z.infer<typeof guidedStepSchema>;
export type GuidedSession = z.infer<typeof guidedSessionSchema>;
