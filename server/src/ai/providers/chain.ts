import type { AIProvider, ModelInfo, ParseStructuredArgs } from "./types.js";
import { logger } from "../../lib/logger.js";

export class FallbackProvider implements AIProvider {
  constructor(private chain: AIProvider[]) {}

  async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
    let lastErr: unknown;
    for (const p of this.chain) {
      try {
        return await p.parseStructured<T>(args);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (!/503|429|UNAVAILABLE|overloaded|high demand/i.test(msg)) throw e;
        logger.warn({ err: e }, "provider failed, trying next");
      }
    }
    throw lastErr;
  }

  async verify(): Promise<boolean> {
    return (await this.chain[0]?.verify()) ?? false;
  }

  async listModels(): Promise<ModelInfo[]> {
    return (await this.chain[0]?.listModels()) ?? [];
  }
}
