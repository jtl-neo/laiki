import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, groupMembers, groups, users } from "../db/schema.js";
import {
  type DraftData,
  type Mode,
  type PendingRow,
} from "../lib/pendingEntry.js";
import { listUserAccounts } from "../lib/resolveAccount.js";
import { getAllFundAccountIds } from "../lib/fundFilters.js";
import { replyMessages, quickReplyActions } from "./reply.js";
import { buildAmountAskQuickReply } from "./flex/amountAsk.js";
import { buildAccountPickFlex } from "./flex/accountPicker.js";
import { buildCategoryPickFlex } from "./flex/categoryPicker.js";
import { buildMemberToggleFlex } from "./flex/memberToggle.js";
import { buildDraftConfirmFlex } from "./flex/draftConfirm.js";
import { CATEGORIES } from "./flex/categoryPicker.js";

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

const KIND_LABEL: Record<DraftData["kind"], string> = {
  expense: "支出",
  income: "收入",
  transfer: "轉帳",
  fund_in: "存入",
  fund_out: "支出",
};

/** Selectable (non-fund) accounts for the speaker, plus the optional fund account. */
export async function listSelectableAccounts(
  userId: string,
  allowFundAccountId?: string | null,
): Promise<{ id: string; name: string; icon: string | null }[]> {
  const fundAcctIdSet = new Set(await getAllFundAccountIds());
  const all = await listUserAccounts(userId);
  return all
    .filter((a) => !fundAcctIdSet.has(a.id) || a.id === allowFundAccountId)
    .map((a) => ({ id: a.id, name: a.name, icon: a.icon ?? null }));
}

/** Display name for a participant: prefer per-group displayName, fall back to users.displayName. */
async function loadGroupMembers(
  groupId: string,
): Promise<{ userId: string; displayName: string }[]> {
  const rows = await db
    .select({
      userId: groupMembers.userId,
      userName: users.displayName,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.userName ?? "成員",
  }));
}

async function namesForUserIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, userIds));
  const byId = new Map(rows.map((r) => [r.id, r.name ?? "成員"]));
  return userIds.map((id) => byId.get(id) ?? "成員");
}

/** Reasonable default amount guesses for the quick-reply. */
function amountGuesses(draft: DraftData): number[] {
  if (draft.amount && draft.amount > 0) {
    const a = Math.round(draft.amount);
    return [a, Math.round(a / 2), a + 100, a * 2].filter((n) => n > 0);
  }
  return [100, 200, 500, 1000];
}

/**
 * Send the prompt that matches the pending row's current step.
 * Used by both the text entry paths and the postback handler.
 */
export async function replyForStep(
  replyToken: string,
  pending: PendingRow,
  mode: Mode,
): Promise<void> {
  const draft = pending.draft as DraftData;
  const step = pending.step;

  if (step === "need_amount") {
    await replyMessages(replyToken, [
      buildAmountAskQuickReply(pending.id, amountGuesses(draft)),
    ]);
    return;
  }

  if (step === "need_account") {
    let allowFundAccountId: string | null = null;
    if (pending.groupId) {
      const [g] = await db
        .select()
        .from(groups)
        .where(eq(groups.id, pending.groupId))
        .limit(1);
      allowFundAccountId = g?.fundAccountId ?? null;
    }
    const accts = await listSelectableAccounts(pending.userId, allowFundAccountId);
    await replyMessages(replyToken, [
      buildAccountPickFlex({ pendingId: pending.id, accounts: accts }),
    ]);
    return;
  }

  if (step === "need_participants") {
    const groupName = pending.groupId
      ? (await groupNameById(pending.groupId)) ?? "群組"
      : "群組";
    const members = pending.groupId ? await loadGroupMembers(pending.groupId) : [];
    const selectedSet = new Set(draft.participantUserIds);
    await replyMessages(replyToken, [
      buildMemberToggleFlex({
        pendingId: pending.id,
        groupName,
        amountLabel: money(draft.amount ?? 0),
        members: members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          selected: selectedSet.has(m.userId),
        })),
      }),
    ]);
    return;
  }

  if (step === "need_debts") {
    await replyMessages(replyToken, [
      {
        type: "text",
        text: "分帳金額對不上 🤔 請再說一次每個人的分攤，例如：\n「a 180、b 200，其他我出」",
        quickReply: quickReplyActions([
          { label: "取消這筆", data: `action=cancel_entry&pendingId=${pending.id}`, displayText: "取消" },
        ]),
      },
    ]);
    return;
  }

  if (step === "need_fund") {
    const { listUserFundGroups } = await import("./router.js");
    const funds = await listUserFundGroups(pending.userId);
    if (funds.length === 0) {
      await replyMessages(replyToken, [
        {
          type: "text",
          text: "你還沒有共同基金帳本。先到選單建立一個，或取消這筆。",
          quickReply: quickReplyActions([
            { label: "取消這筆", data: `action=cancel_entry&pendingId=${pending.id}`, displayText: "取消" },
          ]),
        },
      ]);
      return;
    }
    await replyMessages(replyToken, [
      {
        type: "text",
        text: "要從哪個基金扣款？",
        quickReply: quickReplyActions([
          ...funds.slice(0, 10).map((f) => ({
            label: f.name.slice(0, 20),
            data: `action=pick_fund&pendingId=${pending.id}&groupId=${f.id}`,
            displayText: f.name,
          })),
          { label: "取消", data: `action=cancel_entry&pendingId=${pending.id}`, displayText: "取消" },
        ]),
      },
    ]);
    return;
  }

  if (step === "need_category") {
    await replyMessages(replyToken, [
      buildCategoryPickFlex({
        pendingId: pending.id,
        categories: CATEGORIES.map((c) => c.name),
      }),
    ]);
    return;
  }

  // confirm
  const accountName = draft.accountId
    ? (await accountNameById(draft.accountId)) ?? "—"
    : mode === "fund"
      ? "基金池"
      : "—";
  const groupName = pending.groupId ? await groupNameById(pending.groupId) : null;
  let participantsLabel: string | null = null;
  let perHead: number | null = null;
  if (mode === "group_split" && draft.debtsByName && draft.debtsByName.length > 0) {
    // Unified DM split: explicit per-person amounts from the LLM.
    const debtSum = draft.debtsByName.reduce((s, d) => s + d.amount, 0);
    const myShare =
      draft.myShare ?? Math.round(((draft.amount ?? 0) - debtSum) * 100) / 100;
    participantsLabel = [
      `我 ${money(myShare)}`,
      ...draft.debtsByName.map((d) => `${d.name} ${money(d.amount)}`),
    ].join("、");
  } else if (mode === "group_split" && draft.participantUserIds.length > 0) {
    const names = await namesForUserIds(draft.participantUserIds);
    participantsLabel = names.join("、");
    if (draft.amount && draft.amount > 0) {
      perHead =
        Math.floor((draft.amount / draft.participantUserIds.length) * 100) / 100;
    }
  }
  await replyMessages(replyToken, [
    buildDraftConfirmFlex({
      pendingId: pending.id,
      mode,
      amount: draft.amount ?? 0,
      category: draft.category,
      accountName,
      groupName,
      participantsLabel,
      perHead,
      kindLabel: KIND_LABEL[draft.kind],
      confidence: draft.confidence,
    }),
  ]);
}

async function accountNameById(accountId: string): Promise<string | null> {
  const [a] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return a?.name ?? null;
}

async function groupNameById(groupId: string): Promise<string | null> {
  const [g] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  return g?.name ?? null;
}

/** All member userIds for a group (used to pre-select everyone). */
export async function allGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  return rows.map((r) => r.userId);
}
