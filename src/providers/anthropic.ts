import { parseActionPlan, PlanValidationError } from "../lib/actionSchema";
import type { ActionPlan } from "../lib/types";
import { buildUserContent, PLAN_FUNCTION_DESCRIPTION, PLAN_FUNCTION_NAME, PLAN_PARAMETERS_SCHEMA, SYSTEM_PROMPT } from "./planSchema";
import { ProviderError, type AiProvider, type GeneratePlanArgs } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const PLAN_TOOL = {
  name: PLAN_FUNCTION_NAME,
  description: PLAN_FUNCTION_DESCRIPTION,
  input_schema: PLAN_PARAMETERS_SCHEMA,
};

function buildUserMessageContent(args: GeneratePlanArgs) {
  const text = buildUserContent(args);
  if (!args.image) return text;
  // Anthropic multimodal content blocks (image must come before/with text).
  return [
    { type: "image", source: { type: "base64", media_type: args.image.mimeType, data: args.image.base64 } },
    { type: "text", text },
  ];
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  defaultModel: "claude-sonnet-4-5",

  async generatePlan(args: GeneratePlanArgs): Promise<ActionPlan> {
    if (!args.apiKey) {
      throw new ProviderError("No Anthropic API key configured. Add one in Settings.", "MISSING_API_KEY");
    }

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": args.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          // Required for direct browser/extension calls; the key never leaves
          // this device to any server of ours (BYOK, per OD-02).
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: args.model || "claude-sonnet-4-5",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: [PLAN_TOOL],
          tool_choice: { type: "tool", name: PLAN_FUNCTION_NAME },
          messages: [{ role: "user", content: buildUserMessageContent(args) }],
        }),
      });
    } catch (e) {
      throw new ProviderError(
        `Network error calling Anthropic: ${(e as Error).message}`,
        "NETWORK_ERROR"
      );
    }

    if (response.status === 401) {
      throw new ProviderError("Anthropic rejected the API key (401). Check Settings.", "AUTH_ERROR");
    }
    if (response.status === 429) {
      throw new ProviderError("Anthropic rate limit hit (429). Try again shortly.", "RATE_LIMIT");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(`Anthropic API error ${response.status}: ${text.slice(0, 300)}`, "API_ERROR");
    }

    const body = await response.json();
    const toolUse = (body.content ?? []).find(
      (block: { type: string }) => block.type === "tool_use"
    );
    if (!toolUse) {
      throw new ProviderError("Model did not return a structured plan.", "NO_STRUCTURED_OUTPUT");
    }

    try {
      return parseActionPlan(toolUse.input);
    } catch (e) {
      if (e instanceof PlanValidationError) {
        throw new ProviderError(`Model plan failed validation: ${e.message}`, "INVALID_PLAN");
      }
      throw e;
    }
  },
};
