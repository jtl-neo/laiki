import type { AIProvider, ProviderConfig } from "./types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";
import { GroqProvider } from "./groq.js";
import { OpenRouterProvider } from "./openrouter.js";

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
    case "groq":
      return new GroqProvider(cfg);
    case "openrouter":
      return new OpenRouterProvider(cfg);
    default: {
      const _exhaustive: never = cfg.provider;
      throw new Error(`unknown provider: ${String(_exhaustive)}`);
    }
  }
}
