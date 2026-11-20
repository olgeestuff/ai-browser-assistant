import type { ProviderId } from "../lib/types";
import { anthropicProvider } from "./anthropic";
import type { AiProvider } from "./types";

// Registry: adding a new provider (OpenAI, Google, ...) later means writing
// one new file matching AiProvider and adding one line here — nothing else
// in the extension (orchestrator, content script, UI) changes. FR-013/AC-09.
const registry: Record<ProviderId, AiProvider | undefined> = {
  anthropic: anthropicProvider,
  openai: undefined,
  google: undefined,
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
