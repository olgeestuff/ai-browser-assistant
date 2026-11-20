import { z } from "zod";
import { SENSITIVE_ACTION_TYPES, type ActionPlan, type ActionStep } from "./types";

const ActionTypeEnum = z.enum([
  "navigate",
  "click",
  "fill",
  "select_option",
  "scroll_to",
  "wait",
  "extract",
  "submit_form",
  "send_message",
  "purchase",
  "delete",
  "publish",
]);

const ActionStepSchema = z.object({
  sequence: z.number().int().min(1),
  type: ActionTypeEnum,
  description: z.string().min(1).max(500),
  target: z.string().max(1000).optional(),
  value: z.string().max(5000).optional(),
  requiresConfirmation: z.boolean(),
});

const ActionPlanSchema = z.object({
  summary: z.string().min(1).max(1000),
  steps: z.array(ActionStepSchema).max(25),
  isReadOnly: z.boolean(),
  answer: z.string().max(20000).nullable(),
});

export class PlanValidationError extends Error {
  readonly issues: unknown;
  constructor(message: string, issues: unknown) {
    super(message);
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

/**
 * Parses and validates raw model output into an ActionPlan.
 * Independently of what the model claims, every step whose `type` is in
 * SENSITIVE_ACTION_TYPES is force-flagged `requiresConfirmation = true`.
 * This is the safety net behind FR-010 / AC-07: we never trust the model's
 * own judgement about what is "safe" for consequential actions.
 */
export function parseActionPlan(raw: unknown): ActionPlan {
  const result = ActionPlanSchema.safeParse(raw);
  if (!result.success) {
    throw new PlanValidationError("Model output failed action-plan validation", result.error.issues);
  }
  const plan = result.data;

  const steps: ActionStep[] = plan.steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      ...s,
      requiresConfirmation: s.requiresConfirmation || SENSITIVE_ACTION_TYPES.has(s.type),
    }));

  if (!plan.isReadOnly && steps.length === 0) {
    throw new PlanValidationError("Non-read-only plan must contain at least one step", null);
  }

  return {
    summary: plan.summary,
    steps,
    isReadOnly: plan.isReadOnly,
    answer: plan.answer,
  };
}
