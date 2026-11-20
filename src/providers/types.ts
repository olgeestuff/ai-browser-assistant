import type { ActionPlan, PageContext, ProviderId } from "../lib/types";

export interface GeneratePlanArgs {
  instruction: string;
  page: PageContext;
  apiKey: string;
  model: string;
}

/**
 * Provider-neutral interface (FR-013 / AC-09).
 * The task orchestrator only ever talks to this interface — never to a
 * specific vendor SDK — so a new provider is a new file implementing this,
 * with zero changes to background/content/action-runner code.
 */
export interface AiProvider {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Converts a natural-language instruction + page context into a structured, validated ActionPlan. */
  generatePlan(args: GeneratePlanArgs): Promise<ActionPlan>;
}

export class ProviderError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}
