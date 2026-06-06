import { makeProvider } from "../ai/providers/factory.js";
import { FallbackProvider } from "../ai/providers/chain.js";
import type { AIProvider, ProviderConfig } from "../ai/providers/types.js";
import {
  PLATFORM_GROQ_KEY,
  PLATFORM_OPENROUTER_KEY,
  PLATFORM_OPENROUTER_MODEL,
} from "./config.js";

type AiOp = "parse" | "recognize";

const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Personal deployment: quotas are removed. checkAndConsume never blocks.
export type QuotaResult = {
  allowed: true;
  provider: AIProvider;
  usingBYOK: false;
  providerName: string;
  model: string | null;
};

/**
 * Build the ordered provider chain for the given op.
 * - recognize: Groq vision, then Gemini fallback.
 * - parse: OpenRouter, then Groq, then Gemini fallback.
 */
function buildProviderChain(op: AiOp): ProviderConfig[] {
  const geminiKey = process.env.GEMINI_API_KEY ?? "";
  const out: ProviderConfig[] = [];

  if (op === "recognize") {
    if (PLATFORM_GROQ_KEY) {
      out.push({
        provider: "groq",
        apiKey: PLATFORM_GROQ_KEY,
        endpoint: null,
        model: GROQ_VISION_MODEL,
      });
    }
    if (geminiKey) {
      out.push({ provider: "gemini", apiKey: geminiKey, endpoint: null, model: null });
    }
    return out;
  }

  // op === "parse"
  if (PLATFORM_OPENROUTER_KEY) {
    out.push({
      provider: "openrouter",
      apiKey: PLATFORM_OPENROUTER_KEY,
      endpoint: null,
      model: PLATFORM_OPENROUTER_MODEL,
    });
  }
  if (PLATFORM_GROQ_KEY) {
    out.push({
      provider: "groq",
      apiKey: PLATFORM_GROQ_KEY,
      endpoint: null,
      model: null,
    });
  }
  if (geminiKey) {
    out.push({ provider: "gemini", apiKey: geminiKey, endpoint: null, model: null });
  }
  return out;
}

// Test seam: simulation tests register a fake provider here (via
// setFakeProvider) and set LAIKI_FAKE_AI=1 so handlers never hit a real
// LLM while the rest of the quota/recordAi path stays real.
let fakeProvider: AIProvider | null = null;
export function setFakeProvider(provider: AIProvider | null): void {
  fakeProvider = provider;
}

/**
 * Personal deployment: always returns allowed:true. Picks the provider chain by op
 * and wraps it in a FallbackProvider so transient errors fall through.
 *
 * `userId` is kept in the signature for call-site compatibility but is no longer used
 * for any per-user key selection or quota accounting.
 */
export async function checkAndConsume(_userId: string, op: AiOp): Promise<QuotaResult> {
  if (process.env.LAIKI_FAKE_AI === "1" && fakeProvider) {
    return {
      allowed: true,
      provider: fakeProvider,
      usingBYOK: false,
      providerName: "fake",
      model: "fake",
    };
  }
  const chain = buildProviderChain(op);
  const primary = chain[0];
  const providers = chain.length > 0 ? chain.map(makeProvider) : [];

  return {
    allowed: true,
    provider: new FallbackProvider(providers),
    usingBYOK: false,
    providerName: primary?.provider ?? "none",
    model: primary?.model ?? null,
  };
}
