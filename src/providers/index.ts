import type { ProviderId } from "../lib/types";
import { abacusProvider } from "./abacus";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { openrouterProvider } from "./openrouter";
import type { AiProvider } from "./types";

// Registry: adding a new provider is one new file matching AiProvider and
// one line here — nothing else in the extension (orchestrator, content
// script, UI) changes. FR-013/AC-09.
const registry: Record<ProviderId, AiProvider | undefined> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: geminiProvider,
  openrouter: openrouterProvider,
  abacus: abacusProvider,
};

export function getProvider(id: ProviderId): AiProvider {
  const provider = registry[id];
  if (!provider) {
    throw new Error(`Provider "${id}" is not implemented yet.`);
  }
  return provider;
}

export function listAvailableProviders(): AiProvider[] {
  return Object.values(registry).filter((p): p is AiProvider => Boolean(p));
}
