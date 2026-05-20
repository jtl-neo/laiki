import OpenAI from "openai";
import { retry } from "../../lib/retry.js";
import { logger } from "../../lib/logger.js";
import type { AIProvider, ParseStructuredArgs, ProviderConfig, ModelInfo } from "./types.js";

const DEFAULT_PARSE_MODEL = "gpt-4o-mini";
const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.endpoint ? { baseURL: cfg.endpoint } : {}),
    });
  }

  async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
    const hasImages = args.images && args.images.length > 0;
    const model =
      args.model ??
      this.cfg.model ??
      (hasImages ? DEFAULT_VISION_MODEL : DEFAULT_PARSE_MODEL);

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (hasImages) {
      for (const img of args.images!) {
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        });
      }
    }
    userContent.push({ type: "text", text: args.userText });

    const res = await retry(() =>
      this.client.chat.completions.create({
        model,
        temperature: args.temperature ?? 0.1,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "result",
            strict: false,
            schema: args.schema as unknown as Record<string, unknown>,
          },
        },
      }),
    );

    const raw = res.choices[0]?.message?.content ?? "";
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`openai: invalid JSON from model: ${raw.slice(0, 200)}`);
    }
  }

  async verify(): Promise<boolean> {
    await this.client.models.list();
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    try {
      const page = await this.client.models.list();
      for (const m of page.data) {
        if (!/^gpt-|^o\d|^chatgpt-/.test(m.id)) continue;
        const supportsVision = /4o|gpt-5|vision|gpt-4-turbo/i.test(m.id);
        out.push({ id: m.id, label: m.id, supportsVision });
      }
    } catch (e) {
      logger.warn({ err: e }, "openai listModels failed");
    }
    if (out.length === 0) {
      return [
        { id: "gpt-4o-mini", label: "GPT-4o mini", supportsVision: true },
        { id: "gpt-4o", label: "GPT-4o", supportsVision: true },
        { id: "gpt-4.1-mini", label: "GPT-4.1 mini", supportsVision: true },
      ];
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }
}
