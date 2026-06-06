import type { webhook } from "@line/bot-sdk";
import type { Readable } from "node:stream";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers, accounts, transactions } from "../../db/schema.js";
import { lineBlobClient } from "../client.js";
import { replyMessages, replyText, showLoading, quickReplyActions, flexWithQuickReply } from "../reply.js";
import { parseUnified } from "../../ai/parseUnified.js";
import { loadParseContext } from "../../ai/buildContext.js";
import { checkAndConsume } from "../../lib/quota.js";
import { recordAi } from "../../lib/aiRecords.js";
import { applyDelta, signedAmount } from "../../lib/accountDelta.js";
import { t } from "../../lib/i18n.js";
import { buildTxConfirmFlex } from "../flex/txConfirm.js";
import { buildErrorFlex } from "../flex/error.js";
import { pushRecent } from "../recentTxs.js";
import type { messagingApi } from "@line/bot-sdk";
import { LIFF_BASE } from "../../lib/config.js";
import { buildQuotaExceededFlex } from "../flex/group.js";
import { logger } from "../../lib/logger.js";
import { incr } from "../../routes/metrics.js";

const DEBOUNCE_MS = 1500;
const MAX_BATCH = 8;
const MAX_RAW_BYTES = 10 * 1024 * 1024;

type ImageEvent = webhook.MessageEvent & { message: { type: "image"; id: string } };
type Batch = { events: ImageEvent[]; timer: NodeJS.Timeout };
const batches = new Map<string, Batch>();

async function streamToBase64(stream: Readable): Promise<{ base64: string; mimeType: string }> {
  const chunks: Buffer[] = [];
  let mimeType = "image/jpeg";
  const headers = (stream as unknown as { headers?: Record<string, string> }).headers;
  if (headers && typeof headers["content-type"] === "string") {
    mimeType = headers["content-type"].split(";")[0]!.trim();
  }
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { base64: Buffer.concat(chunks).toString("base64"), mimeType };
}

export async function handleImageMessage(event: webhook.MessageEvent): Promise<void> {
  if (event.message.type !== "image") return;
  const lineUserId = event.source?.userId;
  if (!lineUserId || !event.replyToken) return;
  const isGroupSource = event.source?.type === "group" || event.source?.type === "room";
  if (isGroupSource) return;

  const ev = event as ImageEvent;
  const existing = batches.get(lineUserId);
  if (existing) {
    clearTimeout(existing.timer);
    if (existing.events.length < MAX_BATCH) {
      existing.events.push(ev);
      existing.timer = setTimeout(() => {
        void drainBatch(lineUserId);
      }, DEBOUNCE_MS);
      return;
    }
    batches.delete(lineUserId);
    void processBatch(lineUserId, existing.events);
  }
  const b: Batch = {
    events: [ev],
    timer: setTimeout(() => {
      void drainBatch(lineUserId);
    }, DEBOUNCE_MS),
  };
  batches.set(lineUserId, b);
}

async function drainBatch(lineUserId: string): Promise<void> {
  const b = batches.get(lineUserId);
  if (!b) return;
  batches.delete(lineUserId);
  await processBatch(lineUserId, b.events);
}

type PerImageResult =
  | { status: "ok"; txId: string; bubble: messagingApi.FlexBubble }
  | { status: "quota_exceeded" }
  | { status: "fetch_failed" }
  | { status: "too_large" }
  | { status: "low_conf" }
  | { status: "recognize_failed"; busy: boolean }
  | { status: "no_account" };

async function processBatch(lineUserId: string, events: ImageEvent[]): Promise<void> {
  if (!events.length) return;
  const lastEvent = events[events.length - 1]!;
  const replyToken = lastEvent.replyToken!;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, lineUserId))
    .limit(1);
  if (!user) {
    await replyText(replyToken, "請先加我為好友 🙌");
    return;
  }

  await showLoading(lineUserId, 30);

  const errorQR = quickReplyActions([
    { label: "手動新增", uri: `${LIFF_BASE}/tx/new` },
    { label: "選單", data: "action=menu", displayText: "選單" },
  ]);

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), isNull(accounts.archivedAt)))
    .limit(1);
  if (!account) {
    await replyText(
      replyToken,
      t("no_account", user.locale as "zh-TW"),
      quickReplyActions([{ label: "建立帳戶", uri: `${LIFF_BASE}/accounts` }]),
    );
    return;
  }

  const memberRows = await db
    .select({ group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id))
    .limit(1);
  const group = memberRows[0]?.group;
  if (!group) {
    await replyText(replyToken, "找不到群組，請重新加好友以初始化。");
    return;
  }

  const results = await Promise.all(
    events.map((ev) => processOneImage(ev, user.id, account.id, group.id, group.name, account.name)),
  );

  // Reply assembly
  const okResults = results.filter((r): r is Extract<PerImageResult, { status: "ok" }> => r.status === "ok");
  const quotaCount = results.filter((r) => r.status === "quota_exceeded").length;
  const lowConfCount = results.filter((r) => r.status === "low_conf").length;
  const failCount = results.filter(
    (r) => r.status === "recognize_failed" || r.status === "fetch_failed" || r.status === "too_large",
  ).length;
  const busy = results.some((r) => r.status === "recognize_failed" && r.busy);

  if (okResults.length === 0) {
    if (quotaCount > 0 && results.every((r) => r.status === "quota_exceeded")) {
      await replyMessages(replyToken, [buildQuotaExceededFlex({ liffBase: LIFF_BASE })]);
      return;
    }
    await replyMessages(replyToken, [
      flexWithQuickReply(
        buildErrorFlex({
          title: busy ? "AI 服務忙線中" : failCount > 0 ? "辨識失敗" : "辨識信心過低",
          body: busy
            ? "Gemini 暫時忙線，已重試仍失敗。可手動新增，或稍後再傳一次。"
            : failCount > 0
              ? "看不懂這些收據 😢 可手動新增。"
              : "辨識結果不太準確。請手動新增，或重拍清楚一點。",
          liffNewUrl: `${LIFF_BASE}/tx/new?source=image`,
        }),
        errorQR,
      ),
    ]);
    return;
  }

  // Push each ok txId to recent (single-image path still benefits across batches)
  let recentIds: string[] = [];
  for (const r of okResults) recentIds = pushRecent(lineUserId, r.txId);

  const successQR = quickReplyActions([
    { label: "再傳一張", data: "action=menu", displayText: "再傳一張" },
    ...(okResults.length === 1
      ? [
          { label: "改分類", data: `action=change_category&txId=${okResults[0]!.txId}`, displayText: "改分類" },
          { label: "改帳戶", data: `action=change_account&txId=${okResults[0]!.txId}`, displayText: "改帳戶" },
        ]
      : []),
  ]);

  let outMsg: messagingApi.Message;
  if (okResults.length === 1 && recentIds.length < 2) {
    outMsg = flexWithQuickReply(
      { type: "flex", altText: "已記錄 1 筆", contents: okResults[0]!.bubble },
      successQR,
    );
  } else {
    // Carousel: merge this batch's bubbles with prior recent txs (60s window)
    const batchTxIds = new Set(okResults.map((r) => r.txId));
    const otherIds = recentIds.filter((id) => !batchTxIds.has(id));
    const others = otherIds.length
      ? await db.select().from(transactions).where(inArray(transactions.id, otherIds))
      : [];
    const byId = new Map(others.map((o) => [o.id, o]));
    const accountById = new Map<string, string>([[account.id, account.name]]);
    const missingAccountIds = Array.from(
      new Set(others.map((o) => o.accountId).filter((id): id is string => !!id && !accountById.has(id))),
    );
    if (missingAccountIds.length) {
      const accRows = await db
        .select()
        .from(accounts)
        .where(inArray(accounts.id, missingAccountIds));
      for (const a of accRows) accountById.set(a.id, a.name);
    }

    const bubbleByTx = new Map(okResults.map((r) => [r.txId, r.bubble]));
    const bubbles: messagingApi.FlexBubble[] = [];
    for (const id of recentIds) {
      const b = bubbleByTx.get(id);
      if (b) {
        bubbles.push(b);
        continue;
      }
      const row = byId.get(id);
      if (!row) continue;
      const f = buildTxConfirmFlex({
        txId: row.id,
        amount: Number(row.amount),
        category: row.category ?? null,
        accountName: accountById.get(row.accountId ?? "") ?? account.name,
        groupName: group.name,
        note: row.note ?? null,
        confidence: Number(row.aiConfidence ?? 0),
        liffEditUrl: `${LIFF_BASE}/tx/${row.id}/edit`,
      });
      bubbles.push(f.contents as messagingApi.FlexBubble);
    }

    const altParts = [`已記錄 ${okResults.length} 筆`];
    if (quotaCount > 0) altParts.push(`${quotaCount} 筆額度不足`);
    if (lowConfCount > 0) altParts.push(`${lowConfCount} 筆信心過低`);
    if (failCount > 0) altParts.push(`${failCount} 筆辨識失敗`);

    const carousel: messagingApi.FlexMessage = {
      type: "flex",
      altText: altParts.join("，"),
      contents: { type: "carousel", contents: bubbles.slice(-10) },
    };
    outMsg = flexWithQuickReply(carousel, successQR);
  }

  await replyMessages(replyToken, [outMsg]);
}

async function processOneImage(
  event: ImageEvent,
  userId: string,
  accountId: string,
  groupId: string,
  groupName: string,
  accountName: string,
): Promise<PerImageResult> {
  const quota = await checkAndConsume(userId, "recognize");

  let imageBase64: string;
  let mimeType: string;
  try {
    const stream = await lineBlobClient().getMessageContent(event.message.id);
    const out = await streamToBase64(stream as unknown as Readable);
    imageBase64 = out.base64;
    mimeType = out.mimeType;
  } catch (e) {
    logger.error({ err: e }, "getMessageContent failed");
    return { status: "fetch_failed" };
  }

  const approxRawBytes = Math.floor((imageBase64.length * 3) / 4);
  if (approxRawBytes > MAX_RAW_BYTES) return { status: "too_large" };

  let parsed;
  incr("recognize_total");
  try {
    const context = await loadParseContext(userId);
    parsed = await parseUnified(quota.provider, {
      images: [{ base64: imageBase64, mimeType }],
      context,
    });
  } catch (e) {
    incr("recognize_errors");
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "recognize failed");
    const busy = /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
    return { status: "recognize_failed", busy };
  }

  if (parsed.confidence < 0.3) return { status: "low_conf" };
  if (parsed.data.total_amount === null || parsed.data.total_amount <= 0) {
    return { status: "low_conf" };
  }

  const txDate = parsed.data.tx_date ?? new Date().toISOString().slice(0, 10);
  const amount = Number(parsed.data.total_amount);

  const [tx] = await db
    .insert(transactions)
    .values({
      groupId,
      accountId,
      amount: amount.toFixed(2),
      txDate,
      paidByUserId: userId,
      category: parsed.data.category ?? null,
      kind: "expense",
      note: parsed.data.description ?? null,
      source: "line_image",
      aiConfidence: parsed.confidence.toFixed(3),
    })
    .returning();

  await applyDelta(accountId, signedAmount("expense", amount));

  await recordAi({
    userId,
    groupId,
    op: "recognize",
    source: "line_image",
    provider: quota.providerName,
    model: quota.model,
    imageCount: 1,
    parsedJson: parsed,
    confidence: parsed.confidence,
    transactionId: tx!.id,
  });

  const flex = buildTxConfirmFlex({
    txId: tx!.id,
    amount,
    category: parsed.data.category ?? null,
    accountName,
    groupName,
    note: parsed.data.description ?? null,
    confidence: parsed.confidence,
    liffEditUrl: `${LIFF_BASE}/tx/${tx!.id}/edit`,
  });

  return { status: "ok", txId: tx!.id, bubble: flex.contents as messagingApi.FlexBubble };
}
