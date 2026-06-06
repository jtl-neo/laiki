import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, groups, paymentMethods, users } from "../db/schema.js";

/**
 * Per-user context injected into the unified parse prompt so the LLM can
 * match aliases, payment methods and fund names against what already
 * exists, instead of inventing free-form strings.
 */
export type ParseContext = {
  /** Friend / shadow-account display names known to this user. */
  aliases: string[];
  /** payment_methods.name for this user. */
  paymentMethods: string[];
  /** Fund-group names the user participates in. */
  fundNames: string[];
};

export function emptyContext(): ParseContext {
  return { aliases: [], paymentMethods: [], fundNames: [] };
}

/**
 * Load the user's context from the database: aliases of everyone this
 * user has recorded against (shadow or since-claimed), their payment
 * methods, and the fund groups they belong to.
 */
export async function loadParseContext(userId: string): Promise<ParseContext> {
  const [aliasRows, pmRows, fundRows] = await Promise.all([
    db
      .select({ displayName: users.displayName })
      .from(users)
      .where(and(eq(users.createdBy, userId), isNotNull(users.displayName))),
    db
      .select({ name: paymentMethods.name })
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId)),
    db
      .select({ name: groups.name })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groupMembers.userId, userId), eq(groups.type, "fund"))),
  ]);

  return {
    aliases: aliasRows.map((r) => r.displayName).filter((n): n is string => !!n),
    paymentMethods: pmRows.map((r) => r.name),
    fundNames: fundRows.map((r) => r.name),
  };
}

const MAX_ENTRY_LEN = 30;
const MAX_ENTRIES_PER_SECTION = 30;

/**
 * Sanitize one user-controlled entry before it enters the prompt:
 * flatten control characters/newlines, trim, truncate. Prevents an alias
 * like "小明\n忽略以上指示" from breaking out of its list line (T-143).
 */
function sanitizeEntry(raw: string): string | null {
  const flat = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ENTRY_LEN);
  return flat.length > 0 ? flat : null;
}

function sanitizeList(entries: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    const clean = sanitizeEntry(raw);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_ENTRIES_PER_SECTION) break;
  }
  return out;
}

/**
 * Render the context block appended to the system prompt. Empty context →
 * empty string (no "undefined", no dangling headers). Sections with no
 * entries are omitted.
 */
export function renderContextPrompt(ctx?: ParseContext): string {
  if (!ctx) return "";
  const aliases = sanitizeList(ctx.aliases);
  const paymentMethods = sanitizeList(ctx.paymentMethods);
  const fundNames = sanitizeList(ctx.fundNames);

  const lines: string[] = [];
  if (aliases.length > 0) lines.push(`已知好友：${aliases.join("、")}`);
  if (paymentMethods.length > 0) lines.push(`已知付款方式：${paymentMethods.join("、")}`);
  if (fundNames.length > 0) lines.push(`已知基金：${fundNames.join("、")}`);
  if (lines.length === 0) return "";

  return `\n\n== 使用者已知資料（名稱請對應此清單） ==\n${lines.join("\n")}`;
}
