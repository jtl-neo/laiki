export type ProviderName = "gemini" | "openai" | "anthropic" | "ollama" | "groq" | "openrouter";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  endpoint?: string | null;
  model?: string | null;
}

export interface ProviderImage {
  base64: string;
  mimeType: string;
}

export interface ParseStructuredArgs {
  systemPrompt: string;
  userText: string;
  /** Generic JSON Schema (object). Properties + required + nested types. */
  schema: JsonSchema;
  images?: ProviderImage[];
  model?: string;
  temperature?: number;
}

export type JsonSchemaType =
  | "object"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array";

export interface JsonSchema {
  type: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
}

export interface ModelInfo {
  id: string;
  label?: string;
  supportsVision?: boolean;
}

export interface AIProvider {
  parseStructured<T>(args: ParseStructuredArgs): Promise<T>;
  verify(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
}
