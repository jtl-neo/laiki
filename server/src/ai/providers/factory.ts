import type { AIProvider, ProviderConfig } from "./types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";

export function makeProvider(cfg: ProviderConfig): AIProvider {
  switch (cfg.provider) {
    case "gemini":
      return new GeminiProvider(cfg);
    case "openai":
      return new OpenAIProvider(cfg);
    case "anthropic":
      return new AnthropicProvider(cfg);
    case "ollama":
      return new OllamaProvider(cfg);
    default: {
      const _exhaustive: never = cfg.provider;
      throw new Error(`unknown provider: ${String(_exhaustive)}`);
    }
  }
}
