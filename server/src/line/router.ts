import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, groups } from "../db/schema.js";
import type { UnifiedParse } from "../ai/unifiedSchema.js";
import { deriveMissingFields, validateSplitMath } from "../ai/unifiedSchema.js";
import { resolveAccount } from "../lib/resolveAccount.js";
import type { Account } from "../db/schema.js";
import type { DraftData, DraftKind, Mode } from "../lib/pendingEntry.js";

export type RoutedDraft = {
  mode: Mode;
  draft: DraftData;
  /** Matched fund group for fund_expense (null → ask via need_fund). */
  fundGroupId: string | null;
};

/**
 * Transaction router: map a unified parse onto a draft + state-machine
 * mode. expense/income/transfer → personal; split_expense → group_split
 * (DM-scoped, debts kept by alias until confirm); fund_expense → fund
 * (matched against the user's fund groups).
 */
export async function routeUnified(
  userId: string,
  parse: UnifiedParse,
  opts: { accounts: Account[]; fallbackNote: string },
): Promise<RoutedDraft> {
  const d = parse.data;
  const missing = deriveMissingFields(parse);
  // Split bills must ASK when no payment method was mentioned (新想法
  // 範例一); the personal flow keeps the low-friction legacy default of
  // the user's first account.
  const account =
    parse.type === "split_expense" && !d.payment_method
      ? null
      : resolveAccount(opts.accounts, d.payment_method ?? null);

  const base: DraftData = {
    amount: d.total_amount,
    kind: "expense",
    category: d.category ?? null,
    accountId: account?.id ?? null,
    accountHint: d.payment_method ?? null,
    note: d.description ?? opts.fallbackNote,
    txDate: d.tx_date ?? null,
    participantUserIds: [],
    confidence: parse.confidence,
    missingFields: missing,
  };

  if (parse.type === "split_expense") {
    const math = validateSplitMath(parse);
    const draft: DraftData = {
      ...base,
      kind: "expense",
      // DM split: no member-toggle card; the roster is the debts list.
      participantsConfirmed: true,
      debtsByName: math.valid ? math.debts : [],
      myShare: math.valid ? math.myShare : null,
      missingFields: math.valid
        ? missing.filter((m) => m !== "debt_distribution")
        : [...new Set([...missing, ...math.missing])],
    };
    return { mode: "group_split", draft, fundGroupId: null };
  }

  if (parse.type === "fund_expense") {
    const fundGroupId = await matchFundGroup(userId, d.fund_name ?? null);
    const kind: DraftKind = "fund_out";
    const draft: DraftData = {
      ...base,
      kind,
      category: base.category ?? "基金支出",
      categoryResolved: true,
      fundResolved: fundGroupId !== null,
      missingFields: fundGroupId
        ? missing.filter((m) => m !== "fund_name")
        : [...new Set([...missing, "fund_name"])],
    };
    return { mode: "fund", draft, fundGroupId };
  }

  // transfer → personal draft kept as kind=transfer: it debits the source
  // account (real money out), is excluded from expense/income stats and
  // never touches split debts. No category step.
  // Account-to-account ("從現金轉到LINE Pay"): resolve the destination among
  // the user's own accounts → two-leg transfer (credited at commit).
  if (parse.type === "transfer") {
    const dest = d.transfer_to
      ? resolveAccount(opts.accounts, d.transfer_to)
      : null;
    const sameAsSource = dest && account && dest.id === account.id;
    const transferToAccountId = dest && !sameAsSource ? dest.id : null;
    const note =
      transferToAccountId && account && dest
        ? `轉帳：${account.name} → ${dest.name}`
        : (d.description ?? opts.fallbackNote);
    return {
      mode: "personal",
      draft: {
        ...base,
        kind: "transfer",
        category: null,
        categoryResolved: true,
        transferToAccountId,
        note,
      },
      fundGroupId: null,
    };
  }

  // expense / income → personal draft.
  const kind: DraftKind = parse.type === "income" ? "income" : "expense";
  return { mode: "personal", draft: { ...base, kind }, fundGroupId: null };
}

/**
 * Match an LLM fund name against the user's fund groups: exact
 * (normalized) first, then unique substring either way.
 */
export async function matchFundGroup(
  userId: string,
  fundName: string | null,
): Promise<string | null> {
  if (!fundName) return null;
  const needle = fundName.normalize("NFKC").toLowerCase().trim();
  if (!needle) return null;

  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(and(eq(groupMembers.userId, userId), eq(groups.type, "fund")));

  const exact = rows.filter((g) => g.name.normalize("NFKC").toLowerCase().trim() === needle);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return null;

  const partial = rows.filter((g) => {
    const name = g.name.normalize("NFKC").toLowerCase().trim();
    return name.includes(needle) || needle.includes(name);
  });
  return partial.length === 1 ? partial[0]!.id : null;
}

/** All fund groups the user belongs to (for the need_fund picker). */
export async function listUserFundGroups(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(and(eq(groupMembers.userId, userId), eq(groups.type, "fund")));
}
