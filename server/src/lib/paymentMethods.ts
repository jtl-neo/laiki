import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentMethods } from "../db/schema.js";

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type PaymentMethodType = "CASH" | "CREDIT" | "FUND";

export async function listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  return db.select().from(paymentMethods).where(eq(paymentMethods.userId, userId));
}

export async function createPaymentMethod(
  userId: string,
  name: string,
  type: PaymentMethodType = "CASH",
): Promise<PaymentMethod> {
  const [row] = await db
    .insert(paymentMethods)
    .values({ userId, name: name.trim(), type })
    .returning();
  if (!row) throw new Error("createPaymentMethod: insert failed");
  return row;
}

export async function deletePaymentMethod(userId: string, id: string): Promise<void> {
  await db
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
}

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Resolve an LLM-emitted payment-method string to the user's record.
 * Exact (normalized) match first; otherwise a unique bidirectional
 * substring match (富邦 → 富邦卡). Zero or ambiguous hits → null, and the
 * caller re-asks via Quick Reply (T-233/T-234).
 */
export async function resolvePaymentMethod(
  userId: string,
  llmString: string,
): Promise<PaymentMethod | null> {
  const needle = normalize(llmString);
  if (!needle) return null;

  const all = await listPaymentMethods(userId);
  const exact = all.filter((m) => normalize(m.name) === needle);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  const partial = all.filter((m) => {
    const name = normalize(m.name);
    return name.includes(needle) || needle.includes(name);
  });
  return partial.length === 1 ? partial[0]! : null;
}
