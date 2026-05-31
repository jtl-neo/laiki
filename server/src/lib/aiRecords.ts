import { db } from "../db/client.js";
import { aiRecords } from "../db/schema.js";
import { logger } from "./logger.js";

export interface RecordAiArgs {
  userId: string;
  groupId?: string | null;
  op: "parse" | "recognize";
  source: "line_text" | "line_image" | "liff";
  provider: string;
  model?: string | null;
  inputText?: string | null;
  imageCount?: number;
  rawOutput?: string | null;
  parsedJson?: unknown;
  confidence?: number | null;
  transactionId?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
}

/**
 * Persist one AI inference record for later analysis.
 * Never throws — analytics must not break the user flow.
 * Returns the inserted row id, or null on failure, so callers can later link
 * the committed transaction back to this record.
 */
export async function recordAi(args: RecordAiArgs): Promise<string | null> {
  try {
    const [row] = await db
      .insert(aiRecords)
      .values({
        userId: args.userId,
        groupId: args.groupId ?? null,
        op: args.op,
        source: args.source,
        provider: args.provider,
        model: args.model ?? null,
        inputText: args.inputText ?? null,
        imageCount: args.imageCount ?? 0,
        rawOutput: args.rawOutput ?? null,
        parsedJson: args.parsedJson ?? null,
        confidence:
          args.confidence === null || args.confidence === undefined
            ? null
            : args.confidence.toFixed(3),
        transactionId: args.transactionId ?? null,
        errorMessage: args.errorMessage ?? null,
        latencyMs: args.latencyMs ?? null,
      })
      .returning({ id: aiRecords.id });
    return row?.id ?? null;
  } catch (e) {
    logger.warn({ err: e }, "recordAi insert failed");
    return null;
  }
}
