import { createOpenAiCompatibleProvider } from "./openaiCompatible";

export const abacusProvider = createOpenAiCompatibleProvider({
  id: "abacus",
  label: "Abacus AI (RouteLLM)",
  // "route-llm" lets Abacus pick the best underlying model automatically;
  // you can also name one directly (e.g. "claude-3-5-sonnet", "gpt-4o").
  defaultModel: "route-llm",
  apiUrl: "https://routellm.abacus.ai/v1/chat/completions",
  missingKeyMessage: "No Abacus AI (RouteLLM) API key configured. Add one in Settings.",
});
