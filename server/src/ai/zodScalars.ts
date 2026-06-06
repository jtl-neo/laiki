import { z } from "zod";

/**
 * Shared zod preprocessors for LLM output fields.
 * LLMs frequently emit "", "null" or "undefined" as strings for absent
 * values; normalize all of those to a real null before validation.
 */
export const nullableStr = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "" || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
    return t;
  },
  z.string().nullable().optional(),
);

/** YYYY-MM-DD or null; any other shape (relative words, ROC dates) → null. */
export const txDateStr = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "" || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  },
  z.string().nullable().optional(),
);
