import type { webhook } from "@line/bot-sdk";
import { eq, sql, and as dand } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers, transactions, transactionSplits, accounts } from "../../db/schema.js";
import { parseText } from "../../ai/parseTransaction.js";
import { checkAndConsume } from "../../lib/quota.js";
import { recordAi } from "../../lib/aiRecords.js";
import { listUserAccounts, resolveAccount } from "../../lib/resolveAccount.js";
import { getAllFundAccountIds, getUserFundGroupIds } from "../../lib/fundFilters.js";
import { applyDelta, signedAmount } from "../../lib/accountDelta.js";
import { t } from "../../lib/i18n.js";
import { replyMessages, replyText, showLoading, quickReplyActions, flexWithQuickReply } from "../reply.js";
import { buildTxConfirmFlex } from "../flex/txConfirm.js";
import { buildFundTxFlex } from "../flex/fundTx.js";
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
    parsed = await parseText(quota.provider, text);
  } catch (e) {
    incr("parse_errors");
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "parse failed");
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

  if (parsed.confidence < 0.3) {
    const lowParams = new URLSearchParams({ text });
    if (parsed.amount) lowParams.set("amount", String(parsed.amount));
    if (parsed.category) lowParams.set("category", parsed.category);
    await replyMessages(event.replyToken, [
      flexWithQuickReply(
        buildErrorFlex({
          title: "看不懂這句",
          body: "信心過低。試試「早餐 65 現金」格式，或手動新增這筆。",
          liffNewUrl: `${LIFF_BASE}/tx/new?${lowParams.toString()}`,
        }),
        personalErrorQR,
      ),
    ]);
    return;
  }

  const fundAcctIdSet = new Set(await getAllFundAccountIds());
  const fundGroupIdSet = new Set(await getUserFundGroupIds(user.id));
  const userAccountsAll = await listUserAccounts(user.id);
  const userAccounts = userAccountsAll.filter((a) => !fundAcctIdSet.has(a.id));
  const account = resolveAccount(userAccounts, parsed.account_hint);
  if (!account) {
    await replyText(
      event.replyToken,
      t("no_account", user.locale as "zh-TW"),
      quickReplyActions([{ label: "建立帳戶", uri: `${LIFF_BASE}/accounts` }]),
    );
    return;
  }

  const memberRows = await db
    .select({ group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id));
  const userGroups = memberRows
    .map((r) => r.group)
    .filter((g) => !fundGroupIdSet.has(g.id));
  if (userGroups.length === 0) {
    await replyText(event.replyToken, "找不到群組，請重新加好友以初始化。");
    return;
  }

  let group = userGroups[0]!;
  if (parsed.group_hint) {
    const h = parsed.group_hint.toLowerCase();
    const match = userGroups.find((g) => g.name.toLowerCase().includes(h));
    if (match) group = match;
  }

  const txDate = parsed.tx_date ?? new Date().toISOString().slice(0, 10);
  const kind = parsed.kind === "transfer" ? "expense" : parsed.kind;

  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: group.id,
      accountId: account.id,
      amount: parsed.amount.toFixed(2),
      txDate,
      paidByUserId: user.id,
      category: parsed.category ?? null,
      kind,
      note: parsed.note ?? text,
      source: "line_text",
      aiConfidence: parsed.confidence.toFixed(3),
    })
    .returning();

  await applyDelta(account.id, signedAmount(kind, parsed.amount));

  await recordAi({
    userId: user.id,
    groupId: group.id,
    op: "parse",
    source: "line_text",
    provider: quota.providerName,
    model: quota.model,
    inputText: text,
    parsedJson: parsed,
    confidence: parsed.confidence,
    transactionId: tx!.id,
  });

  const flex = buildTxConfirmFlex({
    txId: tx!.id,
    amount: parsed.amount,
    category: parsed.category ?? null,
    accountName: account.name,
    groupName: group.name,
    note: parsed.note ?? null,
    confidence: parsed.confidence,
    liffEditUrl: `${LIFF_BASE}/tx/${tx!.id}/edit`,
  });

  const others = userAccounts.filter((a) => a.id !== account.id).slice(0, 5);
  const items: { label: string; data?: string; uri?: string; displayText?: string }[] = [
    { label: "再記一筆", data: `action=again`, displayText: "再記一筆" },
    {
      label: "改分類",
      data: `action=change_category&txId=${tx!.id}`,
      displayText: "改分類",
    },
    {
      label: "改金額",
      data: `action=change_amount&txId=${tx!.id}`,
      displayText: "改金額",
    },
    ...others.map((a) => ({
      label: a.name.slice(0, 20),
      data: `action=change_account&txId=${tx!.id}&accountId=${a.id}`,
      displayText: `改成「${a.name}」`,
    })),
  ];
  const qr = quickReplyActions(items);
  await replyMessages(event.replyToken, [flexWithQuickReply(flex, qr)]);
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
  if (parsed.confidence < 0.3) {
    const gLowParams = new URLSearchParams({ text });
    if (parsed.amount) gLowParams.set("amount", String(parsed.amount));
    if (parsed.category) gLowParams.set("category", parsed.category);
    await replyMessages(event.replyToken, [
      flexWithQuickReply(
        buildErrorFlex({
          title: "看不懂這句",
          body: "信心過低。試試「@Bot 火鍋 1200 平分 信用卡」格式。",
          liffNewUrl: `${LIFF_BASE}/group/${group.id}/tx/new?${gLowParams.toString()}`,
        }),
        groupErrorQR,
      ),
    ]);
    return;
  }

  if (group.type === "fund" && group.fundAccountId) {
    const [fundAcct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, group.fundAccountId))
      .limit(1);
    if (!fundAcct) {
      await replyText(event.replyToken, "找不到基金帳戶");
      return;
    }
    const rawKind = parsed.kind === "transfer" ? "expense" : parsed.kind;
    const fundKind: "fund_in" | "fund_out" = rawKind === "income" ? "fund_in" : "fund_out";
    const fundAmount = Number(parsed.amount);
    const fundTxDate = parsed.tx_date ?? new Date().toISOString().slice(0, 10);
    const fundCategory =
      parsed.category && parsed.category.trim().length > 0
        ? parsed.category
        : fundKind === "fund_in"
          ? "儲蓄"
          : "基金支出";

    const [fTx] = await db
      .insert(transactions)
      .values({
        groupId: group.id,
        accountId: fundAcct.id,
        amount: fundAmount.toFixed(2),
        txDate: fundTxDate,
        paidByUserId: user.id,
        category: fundCategory,
        kind: fundKind,
        note: parsed.note ?? text,
        source: "line_text",
        aiConfidence: parsed.confidence.toFixed(3),
      })
      .returning();
    if (!fTx) return;

    await applyDelta(fundAcct.id, signedAmount(fundKind, fundAmount));

    await recordAi({
      userId: user.id,
      groupId: group.id,
      op: "parse",
      source: "line_text",
      provider: quota.providerName,
      model: quota.model,
      inputText: stripped,
      parsedJson: parsed,
      confidence: parsed.confidence,
      transactionId: fTx.id,
    });

    const [updatedAcct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, fundAcct.id))
      .limit(1);
    const newBalance = Number(updatedAcct?.balance ?? 0);

    let userContribution: number | undefined;
    if (fundKind === "fund_in") {
      const [contribRow] = await db
        .select({
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          dand(
            eq(transactions.groupId, group.id),
            eq(transactions.kind, "fund_in"),
            eq(transactions.paidByUserId, user.id),
          ),
        );
      userContribution = Number(contribRow?.total ?? 0);
    }

    const fundRoster = await groupMembersCompact(group.id);
    await replyMessages(event.replyToken, [
      buildFundTxFlex({
        txId: fTx.id,
        user: user.displayName ?? "成員",
        kind: fundKind,
        amount: fundAmount,
        fundBalance: newBalance,
        fundName: fundAcct.name,
        liffEditUrl: `${LIFF_BASE}/tx/${fTx.id}/edit`,
        note: fundRoster || null,
        userContribution,
      }),
    ]);
    return;
  }

  const fundAcctIdSet2 = new Set(await getAllFundAccountIds());
  const userAccountsAll2 = await listUserAccounts(user.id);
  const userAccounts = userAccountsAll2.filter(
    (a) => !fundAcctIdSet2.has(a.id) || a.id === group.fundAccountId,
  );
  const account = resolveAccount(userAccounts, parsed.account_hint);
  if (!account) {
    await replyText(event.replyToken, "找不到付款帳戶。請先在 LIFF 建一個。");
    return;
  }

  const members = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.groupId, group.id));

  const txDate = parsed.tx_date ?? new Date().toISOString().slice(0, 10);
  const kind = parsed.kind === "transfer" ? "expense" : parsed.kind;
  const amount = Number(parsed.amount);

  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: group.id,
      accountId: account.id,
      amount: amount.toFixed(2),
      txDate,
      paidByUserId: user.id,
      category: parsed.category ?? null,
      kind,
      note: parsed.note ?? text,
      source: "line_text",
      aiConfidence: parsed.confidence.toFixed(3),
    })
    .returning();
  if (!tx) return;

  if (members.length > 0) {
    const each = Math.floor((amount * 100) / members.length) / 100;
    const rows = members.map((m, i) => ({
      transactionId: tx.id,
      userId: m.userId,
      amount: (i === members.length - 1
        ? Math.round((amount - each * (members.length - 1)) * 100) / 100
        : each
      ).toFixed(2),
    }));
    await db.insert(transactionSplits).values(rows);
  }

  await applyDelta(account.id, signedAmount(kind, amount));

  await recordAi({
    userId: user.id,
    groupId: group.id,
    op: "parse",
    source: "line_text",
    provider: quota.providerName,
    model: quota.model,
    inputText: stripped,
    parsedJson: parsed,
    confidence: parsed.confidence,
    transactionId: tx.id,
  });

  const roster = await groupMembersCompact(group.id);
  const baseNote = `${user.displayName ?? "成員"} 出，${members.length} 人平分`;
  const flex = buildTxConfirmFlex({
    txId: tx.id,
    amount,
    category: parsed.category ?? null,
    accountName: account.name,
    groupName: group.name,
    note: roster ? `${baseNote}｜${roster}` : baseNote,
    confidence: parsed.confidence,
    liffEditUrl: `${LIFF_BASE}/tx/${tx.id}/edit`,
  });

  await replyMessages(event.replyToken, [flex]);
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
