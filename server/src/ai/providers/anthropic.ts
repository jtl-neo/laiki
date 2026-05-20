import Anthropic from "@anthropic-ai/sdk";
import { retry } from "../../lib/retry.js";
import { logger } from "../../lib/logger.js";
import type { AIProvider, ParseStructuredArgs, ProviderConfig, ModelInfo } from "./types.js";

const DEFAULT_PARSE_MODEL = "claude-haiku-4-5";
const DEFAULT_VISION_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "emit_result";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
    this.client = new Anthropic({
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

    const content: Anthropic.ContentBlockParam[] = [];
    if (hasImages) {
      for (const img of args.images!) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.base64,
          },
        });
      }
    }
    content.push({ type: "text", text: args.userText });

    const res = await retry(() =>
      this.client.messages.create({
        model,
        max_tokens: 1024,
        temperature: args.temperature ?? 0.1,
        system: args.systemPrompt,
        tools: [
          {
            name: TOOL_NAME,
            description: "Emit the structured result.",
            input_schema: args.schema as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content }],
      }),
    );

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === TOOL_NAME) {
        return block.input as T;
      }
    }
    throw new Error("anthropic: no tool_use block returned");
  }

  async verify(): Promise<boolean> {
    await this.client.messages.create({
      model: this.cfg.model ?? DEFAULT_PARSE_MODEL,
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    try {
      const page = await this.client.models.list({ limit: 100 });
      for (const m of page.data) {
        const id = m.id;
        if (!id.startsWith("claude-")) continue;
        out.push({
          id,
          label: m.display_name ?? id,
          supportsVision: true,
        });
      }
    } catch (e) {
      logger.warn({ err: e }, "anthropic listModels failed");
    }
    if (out.length === 0) {
      return [
        { id: "claude-opus-4-7", label: "Claude Opus 4.7", supportsVision: true },
        { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", supportsVision: true },
        { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", supportsVision: true },
      ];
    }
    return out;
  }
}
