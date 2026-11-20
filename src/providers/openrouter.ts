import { createOpenAiCompatibleProvider } from "./openaiCompatible";

export const openrouterProvider = createOpenAiCompatibleProvider({
  id: "openrouter",
  label: "OpenRouter",
  // Any model slug from https://openrouter.ai/models works here, e.g.
  // "anthropic/claude-sonnet-4.5", "openai/gpt-4o", "google/gemini-2.5-pro".
  defaultModel: "openai/gpt-4o",
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  missingKeyMessage: "No OpenRouter API key configured. Add one in Settings.",
  extraHeaders: {
    // Recommended by OpenRouter for attribution; harmless to send, not required to be real.
    "HTTP-Referer": "https://github.com/olgeestuff/ai-browser-assistant",
    "X-Title": "AI Browser Assistant",
  },
});
