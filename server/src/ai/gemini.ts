import { GoogleGenAI, Type, type Schema } from "@google/genai";

export type GeminiClient = GoogleGenAI;

export function makeClient(apiKey: string): GeminiClient {
  return new GoogleGenAI({ apiKey });
}

export { Type };
export type { Schema };
