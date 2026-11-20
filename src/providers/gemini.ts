import { parseActionPlan, PlanValidationError } from "../lib/actionSchema";
import type { ActionPlan } from "../lib/types";
import { buildUserContent, PLAN_FUNCTION_DESCRIPTION, PLAN_FUNCTION_NAME, PLAN_PARAMETERS_SCHEMA, SYSTEM_PROMPT } from "./planSchema";
import { ProviderError, type AiProvider, type GeneratePlanArgs } from "./types";

function buildParts(args: GeneratePlanArgs) {
  const parts: Array<Record<string, unknown>> = [{ text: buildUserContent(args) }];
  if (args.image) {
    parts.push({ inline_data: { mime_type: args.image.mimeType, data: args.image.base64 } });
  }
  return parts;
}

export const geminiProvider: AiProvider = {
  id: "google",
  label: "Google (Gemini)",
  defaultModel: "gemini-2.5-pro",

  async generatePlan(args: GeneratePlanArgs): Promise<ActionPlan> {
    if (!args.apiKey) {
      throw new ProviderError("No Gemini API key configured. Add one in Settings.", "MISSING_API_KEY");
    }

    const model = args.model || "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: buildParts(args) }],
          tools: [
            {
              function_declarations: [
                { name: PLAN_FUNCTION_NAME, description: PLAN_FUNCTION_DESCRIPTION, parameters: PLAN_PARAMETERS_SCHEMA },
              ],
            },
          ],
          tool_config: {
            function_calling_config: { mode: "ANY", allowed_function_names: [PLAN_FUNCTION_NAME] },
          },
        }),
      });
    } catch (e) {
      throw new ProviderError(`Network error calling Gemini: ${(e as Error).message}`, "NETWORK_ERROR");
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new ProviderError(`Gemini rejected the request (${response.status}) — check your API key. `, "AUTH_ERROR");
    }
    if (response.status === 429) {
      throw new ProviderError("Gemini rate limit hit (429). Try again shortly.", "RATE_LIMIT");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(`Gemini API error ${response.status}: ${text.slice(0, 300)}`, "API_ERROR");
    }

    const body = await response.json();
    const parts: Array<{ functionCall?: { name: string; args: unknown } }> = body.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((p) => p.functionCall?.name === PLAN_FUNCTION_NAME)?.functionCall;
    if (!call) {
      throw new ProviderError("Model did not return a structured plan.", "NO_STRUCTURED_OUTPUT");
    }

    try {
      return parseActionPlan(call.args);
    } catch (e) {
      if (e instanceof PlanValidationError) {
        throw new ProviderError(`Model plan failed validation: ${e.message}`, "INVALID_PLAN");
      }
      throw e;
    }
  },
};
