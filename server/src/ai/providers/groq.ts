import OpenAI from "openai";
import { retry } from "../../lib/retry.js";
import { logger } from "../../lib/logger.js";
import type { AIProvider, ParseStructuredArgs, ProviderConfig, ModelInfo } from "./types.js";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_PARSE_MODEL = "qwen/qwen3-32b";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export class GroqProvider implements AIProvider {
  private client: OpenAI;
  private cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.endpoint ?? DEFAULT_BASE_URL,
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

    const schemaHint = `\n\nReturn ONLY a JSON object matching this JSON Schema (no markdown, no commentary):\n${JSON.stringify(args.schema)}`;
    const extra: Record<string, unknown> = { reasoning_format: "hidden" };
    const res = await retry(() =>
      this.client.chat.completions.create({
        model,
        temperature: args.temperature ?? 0.1,
        messages: [
          { role: "system", content: args.systemPrompt + schemaHint },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        ...extra,
      }),
    );

    const raw = res.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const slice = jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
    try {
      return JSON.parse(slice) as T;
    } catch {
      throw new Error(`groq: invalid JSON from model: ${raw.slice(0, 200)}`);
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
        const supportsVision = /llama-4|vision|scout|maverick/i.test(m.id);
        out.push({ id: m.id, label: m.id, supportsVision });
      }
    } catch (e) {
      logger.warn({ err: e }, "groq listModels failed");
    }
    if (out.length === 0) {
      return [
        { id: "qwen/qwen3-32b", label: "Qwen3 32B", supportsVision: false },
        { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", supportsVision: false },
      ];
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }
}
