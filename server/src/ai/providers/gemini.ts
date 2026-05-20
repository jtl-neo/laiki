import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { retry } from "../../lib/retry.js";
import { logger } from "../../lib/logger.js";
import type {
  AIProvider,
  ParseStructuredArgs,
  ProviderConfig,
  JsonSchema,
  ModelInfo,
} from "./types.js";

const DEFAULT_PARSE_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash";

function toGeminiType(t: JsonSchema["type"]): Type {
  switch (t) {
    case "object":
      return Type.OBJECT;
    case "string":
      return Type.STRING;
    case "number":
    case "integer":
      return Type.NUMBER;
    case "boolean":
      return Type.BOOLEAN;
    case "array":
      return Type.ARRAY;
  }
}

function toGeminiSchema(s: JsonSchema): Schema {
  const out: Schema = { type: toGeminiType(s.type) };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum.map((v) => String(v));
  if (s.type === "object" && s.properties) {
    out.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
    if (s.required) out.required = s.required;
  }
  if (s.type === "array" && s.items) {
    out.items = toGeminiSchema(s.items);
  }
  return out;
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private cfg: ProviderConfig;

  constructor(cfg: ProviderConfig) {
    this.cfg = cfg;
    this.client = new GoogleGenAI({ apiKey: cfg.apiKey });
  }

  async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
    const hasImages = args.images && args.images.length > 0;
    const model =
      args.model ??
      this.cfg.model ??
      (hasImages ? DEFAULT_VISION_MODEL : DEFAULT_PARSE_MODEL);
    const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [];
    if (hasImages) {
      for (const img of args.images!) {
        parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
      }
    }
    parts.push({ text: args.userText });

    const res = await retry(() =>
      this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: args.systemPrompt,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(args.schema),
          temperature: args.temperature ?? 0.1,
        },
      }),
    );

    const raw = res.text ?? "";
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`gemini: invalid JSON from model: ${raw.slice(0, 200)}`);
    }
  }

  async verify(): Promise<boolean> {
    const model = this.cfg.model ?? DEFAULT_PARSE_MODEL;
    await this.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      config: { maxOutputTokens: 4, temperature: 0 },
    });
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const apiKey = this.cfg.apiKey;
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
      );
      if (r.ok) {
        const data = (await r.json()) as {
          models?: {
            name?: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }[];
        };
        const out: ModelInfo[] = [];
        for (const m of data.models ?? []) {
          const name = (m.name ?? "").replace(/^models\//, "");
          if (!name || !name.startsWith("gemini")) continue;
          if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
          out.push({
            id: name,
            label: m.displayName ?? name,
            supportsVision: /flash|pro|vision/i.test(name),
          });
        }
        if (out.length > 0) return out;
      }
    } catch (e) {
      logger.warn({ err: e }, "gemini listModels failed");
    }
    return [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", supportsVision: true },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", supportsVision: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", supportsVision: true },
    ];
  }
}
