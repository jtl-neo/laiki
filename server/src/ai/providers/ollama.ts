import { retry } from "../../lib/retry.js";
import { logger } from "../../lib/logger.js";
import type { AIProvider, ParseStructuredArgs, ProviderConfig, ModelInfo } from "./types.js";

const DEFAULT_ENDPOINT = "http://host.docker.internal:11434";
const DEFAULT_MODEL = "llama3.2";

export class OllamaProvider implements AIProvider {
  private endpoint: string;
  private cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
    this.endpoint = (cfg.endpoint && cfg.endpoint.trim()) || DEFAULT_ENDPOINT;
  }

  async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
    const model = args.model ?? this.cfg.model ?? DEFAULT_MODEL;
    const hasImages = args.images && args.images.length > 0;

    const userMsg: Record<string, unknown> = {
      role: "user",
      content: args.userText,
    };
    if (hasImages) {
      userMsg.images = args.images!.map((i) => i.base64);
    }

    const body = {
      model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: args.systemPrompt + "\nReturn JSON matching schema: " + JSON.stringify(args.schema) },
        userMsg,
      ],
      options: { temperature: args.temperature ?? 0.1 },
    };

    const json = await retry(async () => {
      const r = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        const err: Error & { status?: number } = new Error(
          `ollama: status: ${r.status} ${text.slice(0, 200)}`,
        );
        err.status = r.status;
        throw err;
      }
      return (await r.json()) as { message?: { content?: string } };
    });

    const raw = json.message?.content ?? "";
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`ollama: invalid JSON from model: ${raw.slice(0, 200)}`);
    }
  }

  async verify(): Promise<boolean> {
    const r = await fetch(`${this.endpoint}/api/tags`);
    return r.ok;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const r = await fetch(`${this.endpoint}/api/tags`);
      if (!r.ok) return [];
      const data = (await r.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);

      const results = await Promise.all(
        names.map(async (name) => {
          try {
            const sr = await fetch(`${this.endpoint}/api/show`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            });
            if (!sr.ok) return { id: name, label: name, supportsVision: false };
            const sd = (await sr.json()) as { capabilities?: string[] };
            return {
              id: name,
              label: name,
              supportsVision: (sd.capabilities ?? []).includes("vision"),
            };
          } catch {
            return { id: name, label: name, supportsVision: false };
          }
        }),
      );
      return results;
    } catch (e) {
      logger.warn({ err: e }, "ollama listModels failed");
      return [];
    }
  }
}
