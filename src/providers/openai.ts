import { createOpenAiCompatibleProvider } from "./openaiCompatible";

export const openaiProvider = createOpenAiCompatibleProvider({
  id: "openai",
  label: "OpenAI (ChatGPT)",
  defaultModel: "gpt-4o",
  apiUrl: "https://api.openai.com/v1/chat/completions",
  missingKeyMessage: "No OpenAI API key configured. Add one in Settings.",
});
