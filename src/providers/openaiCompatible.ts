import { parseActionPlan, PlanValidationError } from "../lib/actionSchema";
import type { ActionPlan, ProviderId } from "../lib/types";
import { buildUserContent, PLAN_FUNCTION_DESCRIPTION, PLAN_FUNCTION_NAME, PLAN_PARAMETERS_SCHEMA, SYSTEM_PROMPT } from "./planSchema";
import { ProviderError, type AiProvider, type GeneratePlanArgs } from "./types";

interface OpenAiCompatibleConfig {
  id: ProviderId;
  label: string;
  defaultModel: string;
  apiUrl: string;
  /** e.g. "No OpenAI API key configured." */
  missingKeyMessage: string;
  /** Extra headers beyond Authorization/content-type (e.g. OpenRouter's referer/title). */
  extraHeaders?: Record<string, string>;
}

/**
 * Factory for any vendor exposing an OpenAI-compatible /chat/completions
 * endpoint with function-calling (OpenAI itself, OpenRouter, Abacus AI's
 * RouteLLM). One shared implementation, one new file + registry line per
 * vendor — same provider-agnostic pattern as every other adapter (FR-013).
 */
export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): AiProvider {
  function buildUserMessageContent(args: GeneratePlanArgs) {
    const text = buildUserContent(args);
    if (!args.image) return text;
    return [
      { type: "text", text },
      { type: "image_url", image_url: { url: `data:${args.image.mimeType};base64,${args.image.base64}` } },
    ];
  }

  return {
    id: config.id,
    label: config.label,
    defaultModel: config.defaultModel,

    async generatePlan(args: GeneratePlanArgs): Promise<ActionPlan> {
      if (!args.apiKey) {
        throw new ProviderError(config.missingKeyMessage, "MISSING_API_KEY");
      }

      let response: Response;
      try {
        response = await fetch(config.apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${args.apiKey}`,
            ...config.extraHeaders,
          },
          body: JSON.stringify({
            model: args.model || config.defaultModel,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserMessageContent(args) },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: PLAN_FUNCTION_NAME,
                  description: PLAN_FUNCTION_DESCRIPTION,
                  parameters: PLAN_PARAMETERS_SCHEMA,
                },
              },
            ],
            tool_choice: { type: "function", function: { name: PLAN_FUNCTION_NAME } },
          }),
        });
      } catch (e) {
        throw new ProviderError(`Network error calling ${config.label}: ${(e as Error).message}`, "NETWORK_ERROR");
      }

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(`${config.label} rejected the API key (${response.status}). Check Settings.`, "AUTH_ERROR");
      }
      if (response.status === 429) {
        throw new ProviderError(`${config.label} rate limit hit (429). Try again shortly.`, "RATE_LIMIT");
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderError(`${config.label} API error ${response.status}: ${text.slice(0, 300)}`, "API_ERROR");
      }

      const body = await response.json();
      const toolCall = body.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        throw new ProviderError("Model did not return a structured plan.", "NO_STRUCTURED_OUTPUT");
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new ProviderError("Model returned malformed JSON for the plan.", "INVALID_PLAN");
      }

      try {
        return parseActionPlan(parsedArgs);
      } catch (e) {
        if (e instanceof PlanValidationError) {
          throw new ProviderError(`Model plan failed validation: ${e.message}`, "INVALID_PLAN");
        }
        throw e;
      }
    },
  };
}
