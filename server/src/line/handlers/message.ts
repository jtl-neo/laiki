import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers } from "../../db/schema.js";
import { parseText } from "../../ai/parseTransaction.js";
import { parseUnified } from "../../ai/parseUnified.js";
import { loadParseContext } from "../../ai/buildContext.js";
import { routeUnified } from "../router.js";
import { claimBindingCode } from "../../lib/shadowAccount.js";
import { checkAndConsume } from "../../lib/quota.js";
import { recordAi } from "../../lib/aiRecords.js";
import { resolvePersonalGroupId } from "../../lib/ensureDefaults.js";
import { listUserAccounts, resolveAccount } from "../../lib/resolveAccount.js";
import { getAllFundAccountIds, getUserFundGroupIds } from "../../lib/fundFilters.js";
import {
  type DraftData,
  type DraftKind,
  type Mode,
  upsertPending,
  setStep,
  patchDraft,
  computeNextStep,
  getActivePendingForContext,
} from "../../lib/pendingEntry.js";
import { replyForStep, allGroupMemberIds } from "../draftFlow.js";
import { replyMessages, replyText, showLoading, quickReplyActions, flexWithQuickReply } from "../reply.js";
import { buildErrorFlex } from "../flex/error.js";
import { buildPersonalMenuFlex, buildGroupMenuFlex, buildGroupQuickMenuFlex } from "../flex/menu.js";
import { fetchLineGroupName } from "../groupName.js";
import {
  personalBalance,
  personalMonthly,
  personalBalanceData,
  personalMonthlyData,
  groupBalancesText,
  groupSettleText,
  groupMembersText,
  groupMembersCompact,
  groupBalancesData,
  groupSettleData,
  groupMembersData,
} from "../commands.js";
import { buildBalanceFlex } from "../flex/balance.js";
import { buildMonthlyFlex } from "../flex/monthly.js";
import {
  buildGroupBalancesFlex,
  buildGroupSettleFlex,
  buildGroupMembersFlex,
} from "../flex/group.js";
import { LIFF_BASE, BOT_BASIC_ID } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { incr } from "../../routes/metrics.js";

export async function handleTextMessage(event: webhook.MessageEvent): Promise<void> {
  if (event.message.type !== "text") return;
  const text = event.message.text.trim();
  if (!text) return;

  const lineUserId = event.source?.userId;
  if (!lineUserId || !event.replyToken) return;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, lineUserId))
    .limit(1);
  if (!user) {
    await replyText(event.replyToken, "請先加我為好友 🙌");
    return;
  }

  const isGroupSource = event.source?.type === "group" || event.source?.type === "room";
  if (isGroupSource) {
    await handleGroupText(event, user, text);
    return;
  }

  if (await tryPersonalCommand(event.replyToken, user.id, text)) return;

  // PIN claim intercept: a bare 6-digit number is checked against
  // binding_codes BEFORE the amount shortcut and the parser, so a PIN can
  // never be swallowed as an amount (T-316). Unknown codes fall through.
  if (await tryClaimPin(event.replyToken, lineUserId, user.displayName, text)) return;

  // STEP 4: if there's an active draft for this DM waiting on the amount and the
  // user simply typed a positive number, treat it as the amount answer instead
  // of starting a brand-new parse.
  if (await tryAnswerAmount(event.replyToken, user.id, null, text, "personal")) return;

  await showLoading(lineUserId, 10);

  const quota = await checkAndConsume(user.id, "parse");

  const personalErrorQR = quickReplyActions([
    { label: "手動新增", uri: `${LIFF_BASE}/tx/new` },
    { label: "選單", data: "action=menu", displayText: "選單" },
    { label: "餘額", data: "action=balance", displayText: "餘額" },
  ]);

  let parsed;
  incr("parse_total");
  try {
    const context = await loadParseContext(user.id);
    parsed = await parseUnified(quota.provider, { text, context });
  } catch (e) {
    incr("parse_errors");
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "parse failed");
    // Record the failed inference so the eval/debug trail stays complete.
    await recordAi({
      userId: user.id,
      groupId: null,
      op: "parse",
      source: "line_text",
      provider: quota.providerName,
      model: quota.model,
      inputText: text,
      errorMessage: msg,
    }).catch(() => {});
    const busy = /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
    await replyMessages(event.replyToken, [
      flexWithQuickReply(
        buildErrorFlex({
          title: busy ? "AI 服務忙線中" : "看不懂這句",
          body: busy
            ? "Gemini 暫時忙線，已重試仍失敗。可手動新增這筆，或稍後再傳一次。"
            : "試試「早餐 65 現金」格式，或手動新增這筆。",
          liffNewUrl: `${LIFF_BASE}/tx/new?text=${encodeURIComponent(text)}`,
        }),
        personalErrorQR,
      ),
    ]);
    return;
  }

  // Low confidence no longer hard-fails: as long as the parse succeeded with a
  // usable amount, proceed to a draft and let the user confirm/edit interactively.

  // Resolve the speaker's selectable (non-fund) accounts so we can try to
  // pre-fill the account from the parsed hint (null if no match -> ask later).
  const fundAcctIdSet = new Set(await getAllFundAccountIds());
  const userAccountsAll = await listUserAccounts(user.id);
  const userAccounts = userAccountsAll.filter((a) => !fundAcctIdSet.has(a.id));

  // Deterministically resolve the speaker's personal (DM) group: the group
  // owned by the user with no lineGroupId (created by ensureUserDefaults).
  const personalGroupId = await resolvePersonalGroupId(user.id);
  const [personalGroup] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, personalGroupId))
    .limit(1);
  if (!personalGroup) {
    await replyText(event.replyToken, "找不到群組，請重新加好友以初始化。");
    return;
  }

  // Transaction router: unified type → mode + draft (split keeps debts by
  // alias until confirm; fund matches the user's fund groups).
  const routed = await routeUnified(user.id, parsed, {
    accounts: userAccounts,
    fallbackNote: text,
  });

  const pendingGroupId =
    routed.mode === "fund" ? routed.fundGroupId : personalGroup.id;

  const aiRecordId = await recordAi({
    userId: user.id,
    groupId: pendingGroupId,
    op: "parse",
    source: "line_text",
    provider: quota.providerName,
    model: quota.model,
    inputText: text,
    parsedJson: parsed,
    confidence: parsed.confidence,
  });

  const pending = await upsertPending({
    userId: user.id,
    groupId: pendingGroupId,
    lineGroupId: null,
    mode: routed.mode,
    step: "need_amount",
    draft: routed.draft,
    aiRecordId,
  });
  const advanced =
    (await setStep(pending.id, computeNextStep(routed.mode, routed.draft))) ?? pending;
  await replyForStep(event.replyToken, advanced, routed.mode);
}

/**
 * Intercept a bare 6-digit PIN and try to claim a shadow account with it.
 * Looks up binding_codes first; unknown codes return false so the text
 * falls through to the normal amount/parse path (T-316).
 */
async function tryClaimPin(
  replyToken: string,
  lineUserId: string,
  displayName: string | null,
  text: string,
): Promise<boolean> {
  if (!/^\d{6}$/.test(text.trim())) return false;

  const result = await claimBindingCode(text.trim(), lineUserId, displayName);
  if (!result.ok) {
    if (result.error === "not_found") return false; // probably an amount
    const msg =
      result.error === "expired"
        ? "這組綁定碼已過期，請對方重新產生一組。"
        : result.error === "used"
          ? "這組綁定碼已被使用過了。"
          : result.error === "self_claim"
            ? "這是你自己產生的綁定碼，不能自己認領喔。"
            : "這組綁定碼無法使用。";
    await replyText(replyToken, msg);
    return true;
  }

  const { getOutstandingForUser } = await import("../../lib/debts.js");
  const { buildClaimHistoryFlex } = await import("../flex/claimHistory.js");
  const { notifyClaim } = await import("../../lib/notify.js");
  const outstanding = await getOutstandingForUser(result.userId);
  await replyMessages(replyToken, [
    buildClaimHistoryFlex({
      iOwe: outstanding.iOwe.map((o) => ({ displayName: o.displayName, amount: o.amount })),
      owedToMe: outstanding.owedToMe.map((o) => ({
        displayName: o.displayName,
        amount: o.amount,
      })),
    }),
  ]);
  // Best-effort: tell the creator their friend just claimed (T-315).
  void notifyClaim(result.creatorId, displayName);
  return true;
}

async function handleGroupText(
  event: webhook.MessageEvent,
  user: typeof users.$inferSelect,
  text: string,
): Promise<void> {
  if (!event.replyToken) return;
  const lineGroupId =
    event.source?.type === "group"
      ? event.source.groupId
      : event.source?.type === "room"
        ? event.source.roomId
        : undefined;
  if (!lineGroupId) return;

  const msg = event.message;
  if (msg.type !== "text") return;
  const mentionees =
    (
      msg as {
        mention?: {
          mentionees?: { isSelf?: boolean; type?: string; index?: number; length?: number }[];
        };
      }
    ).mention?.mentionees ?? [];
  const isSelfMention = mentionees.some((m) => m.isSelf === true);
  const textMention = isTextMentionBot(text);
  const botMentioned = isSelfMention || textMention;
  logger.info(
    {
      lineGroupId,
      userId: user.id,
      text,
      mentionees,
      isSelfMention,
      textMention,
      botMentioned,
      botBasicId: BOT_BASIC_ID,
    },
    "group text received",
  );
  if (!botMentioned) {
    logger.warn({ text, mentionees }, "group text ignored: bot not mentioned");
    return;
  }

  const rawText = (msg as { text: string }).text;
  const selfMentions = mentionees
    .filter((m) => m.isSelf === true && typeof m.index === "number" && typeof m.length === "number")
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  let cleaned = rawText;
  for (const m of selfMentions) {
    cleaned = cleaned.slice(0, m.index!) + cleaned.slice((m.index ?? 0) + (m.length ?? 0));
  }
  const stripped = (selfMentions.length > 0 ? cleaned : cleaned.replace(/@\S+/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  logger.info({ rawText, stripped }, "group text stripped");
  if (!stripped || /^[\s\p{P}]+$/u.test(stripped)) {
    const [g] = await db
      .select()
      .from(groups)
      .where(eq(groups.lineGroupId, lineGroupId))
      .limit(1);
    if (g) {
      await replyMessages(event.replyToken, [
        buildGroupQuickMenuFlex({
          groupId: g.id,
          groupName: g.name,
          groupType: g.type,
          liffBase: LIFF_BASE,
        }),
      ]);
    }
    return;
  }

  if (await tryGroupCommand(event.replyToken, lineGroupId, stripped)) return;

  // STEP 4: typed number answers an active group draft awaiting the amount.
  if (await tryAnswerAmount(event.replyToken, user.id, lineGroupId, stripped, "group")) {
    return;
  }

  let [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);
  if (!group) {
    const [g] = await db
      .insert(groups)
      .values({
        type: "shared",
        name: (await fetchLineGroupName(lineGroupId)) ?? "LINE 群組",
        ownerUserId: user.id,
        lineGroupId,
      })
      .returning();
    if (!g) return;
    group = g;
  }


  const quota = await checkAndConsume(user.id, "parse");

  const groupErrorQR = quickReplyActions([
    { label: "手動新增", uri: `${LIFF_BASE}/group/${group.id}/tx/new` },
    { label: "選單", data: `action=group_menu&groupId=${group.id}`, displayText: "選單" },
    { label: "結算", data: `action=group_settle&groupId=${group.id}`, displayText: "結算" },
  ]);

  let parsed;
  incr("parse_total");
  try {
    parsed = await parseText(quota.provider, stripped);
  } catch (e) {
    incr("parse_errors");
    const m = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "group parse failed");
    const busy = /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED/i.test(m);
    await replyMessages(event.replyToken, [
      flexWithQuickReply(
        buildErrorFlex({
          title: busy ? "AI 服務忙線中" : "看不懂這句",
          body: busy
            ? "Gemini 暫時忙線，已重試仍失敗。稍後再 @ 我一次。"
            : "試試「@Bot 火鍋 1200 平分 信用卡」格式。",
          liffNewUrl: `${LIFF_BASE}/group/${group.id}/tx/new?text=${encodeURIComponent(text)}`,
        }),
        groupErrorQR,
      ),
    ]);
    return;
  }
  // Low confidence no longer hard-fails; proceed to an interactive draft.

  const aiRecordId = await recordAi({
    userId: user.id,
    groupId: group.id,
    op: "parse",
    source: "line_text",
    provider: quota.providerName,
    model: quota.model,
    inputText: stripped,
    parsedJson: parsed,
    confidence: parsed.confidence,
  });

  if (group.type === "fund" && group.fundAccountId) {
    // Fund mode: amount -> confirm. Account resolved at commit; category
    // auto-applied (commitPending does not auto-categorize, so seed it here).
    const rawKind = parsed.kind === "transfer" ? "expense" : parsed.kind;
    const fundKind: DraftKind = rawKind === "income" ? "fund_in" : "fund_out";
    const fundCategory =
      parsed.category && parsed.category.trim().length > 0
        ? parsed.category
        : fundKind === "fund_in"
          ? "儲蓄"
          : "基金支出";
    const fundDraft: DraftData = {
      amount: parsed.amount ?? null,
      kind: fundKind,
      category: fundCategory,
      accountId: null,
      accountHint: parsed.account_hint ?? null,
      note: parsed.note ?? text,
      txDate: parsed.tx_date ?? null,
      participantUserIds: [],
      confidence: parsed.confidence,
      categoryResolved: true,
    };
    const fundPending = await upsertPending({
      userId: user.id,
      groupId: group.id,
      lineGroupId,
      mode: "fund",
      step: "need_amount",
      draft: fundDraft,
      aiRecordId,
    });
    const advanced =
      (await setStep(fundPending.id, computeNextStep("fund", fundDraft))) ??
      fundPending;
    await replyForStep(event.replyToken, advanced, "fund");
    return;
  }

  // group_split mode.
  const fundAcctIdSet2 = new Set(await getAllFundAccountIds());
  const userAccountsAll2 = await listUserAccounts(user.id);
  const userAccounts = userAccountsAll2.filter(
    (a) => !fundAcctIdSet2.has(a.id) || a.id === group.fundAccountId,
  );
  const account = resolveAccount(userAccounts, parsed.account_hint);
  const kind: DraftKind = parsed.kind === "transfer" ? "expense" : parsed.kind;
  const splitDraft: DraftData = {
    amount: parsed.amount ?? null,
    kind,
    category: parsed.category ?? null,
    accountId: account?.id ?? null,
    accountHint: parsed.account_hint ?? null,
    note: parsed.note ?? text,
    txDate: parsed.tx_date ?? null,
    participantUserIds: [],
    participantsConfirmed: false,
    confidence: parsed.confidence,
  };
  const splitPending = await upsertPending({
    userId: user.id,
    groupId: group.id,
    lineGroupId,
    mode: "group_split",
    step: "need_amount",
    draft: splitDraft,
    aiRecordId,
  });
  // If the flow will next ask for participants, pre-select everyone so the card
  // shows all members checked (user can untick).
  const nextStep = computeNextStep("group_split", splitDraft);
  let advanced = (await setStep(splitPending.id, nextStep)) ?? splitPending;
  if (nextStep === "need_participants") {
    const everyone = await allGroupMemberIds(group.id);
    advanced =
      (await patchDraft(splitPending.id, { participantUserIds: everyone })) ??
      advanced;
  }
  await replyForStep(event.replyToken, advanced, "group_split");
}

/**
 * If an active draft for this context is waiting on the amount and the message
 * is just a positive number, set it as the amount and advance. Returns true if
 * handled (caller should stop). Keeps the typed-number shortcut self-contained.
 */
async function tryAnswerAmount(
  replyToken: string,
  userId: string,
  lineGroupId: string | null,
  text: string,
  contextMode: "personal" | "group",
): Promise<boolean> {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return false;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  const active = await getActivePendingForContext(userId, lineGroupId);
  if (!active || active.step !== "need_amount") return false;

  const updated = await patchDraft(active.id, { amount });
  if (!updated) return false;
  const mode = updated.mode as Mode;
  const draft = updated.draft as DraftData;
  const next = computeNextStep(mode, draft);
  let advanced = (await setStep(active.id, next)) ?? updated;
  // Pre-select everyone if we just landed on participant selection.
  if (next === "need_participants" && updated.groupId) {
    const everyone = await allGroupMemberIds(updated.groupId);
    advanced = (await patchDraft(active.id, { participantUserIds: everyone })) ?? advanced;
  }
  await replyForStep(replyToken, advanced, mode);
  void contextMode;
  return true;
}

async function tryPersonalCommand(
  replyToken: string,
  userId: string,
  text: string,
): Promise<boolean> {
  const t = text.trim();
  if (/^(選單|menu|功能|help|\?|？)$/i.test(t)) {
    await replyMessages(replyToken, [buildPersonalMenuFlex(LIFF_BASE)]);
    return true;
  }
  if (/^(餘額|balance)$/i.test(t)) {
    const data = await personalBalanceData(userId);
    await replyMessages(replyToken, [buildBalanceFlex({ ...data, liffBase: LIFF_BASE })]);
    return true;
  }
  if (/^(本月|month|月結)$/i.test(t)) {
    const data = await personalMonthlyData(userId);
    await replyMessages(replyToken, [buildMonthlyFlex({ ...data, liffBase: LIFF_BASE })]);
    return true;
  }
  return false;
}

function stripMention(text: string): string {
  return text.replace(/@\S+/g, "").trim();
}

function isTextMentionBot(text: string): boolean {
  const lower = text.toLowerCase();
  if (/(^|\s)@(bot|laiki|來記|来记)\b/i.test(text)) return true;
  if (BOT_BASIC_ID) {
    const id = BOT_BASIC_ID.startsWith("@")
      ? BOT_BASIC_ID.slice(1).toLowerCase()
      : BOT_BASIC_ID.toLowerCase();
    if (id && lower.includes(`@${id}`)) return true;
  }
  return false;
}

async function tryGroupCommand(
  replyToken: string,
  lineGroupId: string,
  text: string,
): Promise<boolean> {
  const cmd = stripMention(text);
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);
  if (!group) return false;

  if (/^(選單|menu|功能|help|\?|？)$/i.test(cmd)) {
    await replyMessages(replyToken, [
      buildGroupMenuFlex({
        groupId: group.id,
        groupName: group.name,
        groupType: group.type,
        liffBase: LIFF_BASE,
      }),
    ]);
    return true;
  }
  if (/^(結算|月結|settle)$/i.test(cmd)) {
    const data = await groupSettleData(group.id);
    await replyMessages(replyToken, [
      buildGroupSettleFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return true;
  }
  if (/^(餘額|balances?)$/i.test(cmd)) {
    const data = await groupBalancesData(group.id);
    await replyMessages(replyToken, [
      buildGroupBalancesFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return true;
  }
  if (/^(名單|成員|members?)$/i.test(cmd)) {
    const data = await groupMembersData(group.id);
    await replyMessages(replyToken, [
      buildGroupMembersFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return true;
  }
  return false;
}
