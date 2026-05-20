import type { webhook } from "@line/bot-sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { transactions, groups, users, accounts, accountMembers, groupMembers, userPreferences, settlements } from "../../db/schema.js";
import { and as dand } from "drizzle-orm";
import { applyDelta, signedAmount } from "../../lib/accountDelta.js";
import { canAccessAccount } from "../../lib/resolveAccount.js";
import { replyText, replyMessages, quickReplyActions, showLoading } from "../reply.js";
import { buildCategoryPickerFlex } from "../flex/categoryPicker.js";
import { buildAccountPickerFlex } from "../flex/accountPicker.js";
import { listUserAccounts } from "../../lib/resolveAccount.js";
import { t } from "../../lib/i18n.js";
import {
  personalBalance,
  personalMonthly,
  personalBalanceData,
  personalMonthlyData,
  groupBalancesText,
  groupSettleText,
  groupMembersText,
  groupBalancesData,
  groupSettleData,
  groupMembersData,
} from "../commands.js";
import { buildPersonalMenuFlex, buildGroupMenuFlex } from "../flex/menu.js";
import { buildBalanceFlex } from "../flex/balance.js";
import { buildMonthlyFlex } from "../flex/monthly.js";
import {
  buildGroupBalancesFlex,
  buildGroupSettleFlex,
  buildGroupMembersFlex,
  buildFundContributionsFlex,
} from "../flex/group.js";
import { LIFF_BASE } from "../../lib/config.js";

export async function handlePostback(event: webhook.PostbackEvent): Promise<void> {
  const data = event.postback?.data ?? "";
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const replyToken = event.replyToken;
  if (!replyToken) return;

  if (action === "group_type") {
    const groupId = params.get("groupId");
    const type = params.get("type");
    if (!groupId || (type !== "shared" && type !== "fund")) return;
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!g) {
      await replyText(replyToken, "找不到群組");
      return;
    }
    const typeLabel = type === "fund" ? "共同基金" : "群組分帳";
    await db
      .update(groups)
      .set({ type, updatedAt: new Date() })
      .where(eq(groups.id, groupId));

    let extra = "";
    if (type === "fund") {
      const acctName = `${g.name} 基金池`;
      let [existing] = await db
        .select()
        .from(accounts)
        .where(dand(eq(accounts.userId, g.ownerUserId), eq(accounts.name, acctName)))
        .limit(1);
      if (!existing) {
        const [created] = await db
          .insert(accounts)
          .values({
            userId: g.ownerUserId,
            name: acctName,
            type: "cash",
            icon: "🏦",
          })
          .returning();
        existing = created;
        extra = `\n已建立專屬帳戶「${acctName}」用於記錄本基金收支。`;
      }
      if (existing) {
        await db
          .update(groups)
          .set({ fundAccountId: existing.id, updatedAt: new Date() })
          .where(eq(groups.id, groupId));
        const gms = await db
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.groupId, groupId));
        for (const gm of gms) {
          if (gm.userId === g.ownerUserId) continue;
          await db
            .insert(accountMembers)
            .values({ accountId: existing.id, userId: gm.userId, role: "editor" })
            .onConflictDoNothing();
        }
      }
    }

    const examples =
      type === "fund"
        ? "\n\n存入範例：@bot 收到 5000\n支出範例：@bot 餐費 800\n@bot 餘額 查看池"
        : "\n\n使用範例：@bot 火鍋 1200 信用卡\n@bot 結算 查看欠款";
    await replyText(
      replyToken,
      `✓ 「${g.name}」已設為${typeLabel}模式。請所有要參與的成員直接在群組發言一次，我會自動把你加入名單。${extra}${examples}`,
    );
    return;
  }

  if (action === "menu") {
    await replyMessages(replyToken, [buildPersonalMenuFlex(LIFF_BASE)]);
    return;
  }

  if (action === "group_menu") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!g) return;
    await replyMessages(replyToken, [
      buildGroupMenuFlex({
        groupId: g.id,
        groupName: g.name,
        groupType: g.type,
        liffBase: LIFF_BASE,
      }),
    ]);
    return;
  }

  if (action === "balance") {
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;
    const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
    if (!u) return;
    const data = await personalBalanceData(u.id);
    await replyMessages(replyToken, [buildBalanceFlex({ ...data, liffBase: LIFF_BASE })]);
    return;
  }

  if (action === "monthly") {
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;
    const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
    if (!u) return;
    const data = await personalMonthlyData(u.id);
    await replyMessages(replyToken, [buildMonthlyFlex({ ...data, liffBase: LIFF_BASE })]);
    return;
  }

  if (action === "group_settle") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const data = await groupSettleData(groupId);
    await replyMessages(replyToken, [
      buildGroupSettleFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return;
  }

  if (action === "group_balances") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const data = await groupBalancesData(groupId);
    await replyMessages(replyToken, [
      buildGroupBalancesFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return;
  }

  if (action === "fund_balance") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!g || !g.fundAccountId) {
      await replyText(replyToken, "尚未建立基金帳戶");
      return;
    }
    const [acct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, g.fundAccountId))
      .limit(1);
    if (!acct) {
      await replyText(replyToken, "找不到基金帳戶");
      return;
    }
    await replyText(
      replyToken,
      `${acct.name}\n餘額：NT$${Number(acct.balance).toLocaleString("zh-TW")}`,
    );
    return;
  }

  if (action === "fund_contributions") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const rows = await db
      .select({
        userId: transactions.paidByUserId,
        name: users.displayName,
        total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(users, eq(users.id, transactions.paidByUserId))
      .where(dand(eq(transactions.groupId, groupId), eq(transactions.kind, "fund_in")))
      .groupBy(transactions.paidByUserId, users.displayName);
    if (rows.length === 0) {
      await replyText(replyToken, "尚無基金存入紀錄");
      return;
    }
    const items = rows
      .map((r) => ({ name: r.name ?? "成員", total: Number(r.total) }))
      .sort((a, b) => b.total - a.total);
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    const fundName = g?.name ? `${g.name} 基金池` : "基金";
    await replyMessages(replyToken, [
      buildFundContributionsFlex({ rows: items, fundName, liffBase: LIFF_BASE, groupId }),
    ]);
    return;
  }

  if (action === "group_members") {
    const groupId = params.get("groupId");
    if (!groupId) return;
    const data = await groupMembersData(groupId);
    await replyMessages(replyToken, [
      buildGroupMembersFlex({ ...data, liffBase: LIFF_BASE }),
    ]);
    return;
  }

  if (action === "noop") {
    return;
  }

  if (action === "demo_text") {
    await replyText(replyToken, "複製這句傳給我試試：『早餐 65 現金』");
    return;
  }

  if (action === "demo_image") {
    await replyText(
      replyToken,
      [
        "📸 拍發票記帳教學",
        "",
        "1. 拍下發票或收據（建議光線充足、平放）",
        "2. 直接傳圖片給我",
        "3. AI 自動辨識金額、商家、分類、日期",
        "4. 一次可傳多張，會一起記帳並回覆統整結果",
        "",
        "信心過低時會提示你手動補上。",
      ].join("\n"),
    );
    return;
  }

  if (action === "record_paid") {
    const groupId = params.get("groupId");
    const fromUserId = params.get("fromUserId");
    const toUserId = params.get("toUserId");
    const amountStr = params.get("amount");
    if (!groupId || !fromUserId || !toUserId || !amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      await replyText(replyToken, "金額無效");
      return;
    }
    await db.insert(settlements).values({
      groupId,
      fromUserId,
      toUserId,
      fromAccountId: null,
      toAccountId: null,
      amount: amount.toFixed(2),
    });
    const memberRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, fromUserId));
    const [toRow] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, toUserId))
      .limit(1);
    const fromName = memberRows[0]?.displayName ?? "成員";
    const toName = toRow?.displayName ?? "成員";
    await replyText(
      replyToken,
      `✓ 已記錄 ${fromName}→${toName} NT$${amount.toLocaleString("zh-TW")}`,
    );
    return;
  }

  if (action === "notify_off") {
    const type = params.get("type");
    const lineUserId = event.source?.userId;
    if (!lineUserId || (type !== "weekly" && type !== "monthly" && type !== "nudge")) return;
    const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
    if (!u) return;
    const col =
      type === "weekly"
        ? "notifyWeekly"
        : type === "monthly"
          ? "notifyMonthly"
          : "notifyNudge";
    const label = type === "weekly" ? "AI 週報" : type === "monthly" ? "每月結算" : "回流提醒";
    await db
      .insert(userPreferences)
      .values({
        userId: u.id,
        notifyWeekly: type === "weekly" ? false : true,
        notifyMonthly: type === "monthly" ? false : true,
        notifyNudge: type === "nudge" ? false : true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { [col]: false, updatedAt: new Date() },
      });
    await replyText(replyToken, `✓ 已關閉${label}通知，可在設定重新開啟`);
    return;
  }

  if (action === "change_account") {
    const txId = params.get("txId");
    const accountId = params.get("accountId");
    if (!txId) return;
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;
    const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);
    if (!u) return;
    if (!accountId) {
      const accts = await listUserAccounts(u.id);
      if (!accts.length) {
        await replyText(replyToken, "你還沒有任何帳戶");
        return;
      }
      await replyMessages(replyToken, [buildAccountPickerFlex(txId, accts)]);
      return;
    }
    const ok = await canAccessAccount(u.id, accountId);
    if (!ok) {
      await replyText(replyToken, "你沒有權限使用此帳戶");
      return;
    }
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) {
      await replyText(replyToken, "找不到該筆交易");
      return;
    }
    if (tx.accountId === accountId) {
      const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
      await replyText(replyToken, `已是「${a?.name ?? "該帳戶"}」`);
      return;
    }
    const amount = Number(tx.amount);
    await applyDelta(tx.accountId, -signedAmount(tx.kind, amount));
    await db
      .update(transactions)
      .set({ accountId, updatedAt: new Date() })
      .where(eq(transactions.id, txId));
    await applyDelta(accountId, signedAmount(tx.kind, amount));
    const [newAcct] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    await replyText(replyToken, `✓ 已改成「${newAcct?.name ?? "新帳戶"}」`);
    return;
  }

  if (action === "again") {
    const lineUserId = event.source?.userId;
    if (lineUserId) {
      await showLoading(lineUserId, 10);
    }
    await replyText(replyToken, "請說下一筆");
    return;
  }

  if (action === "change_category") {
    const txId = params.get("txId");
    if (!txId) return;
    await replyMessages(replyToken, [buildCategoryPickerFlex(txId)]);
    return;
  }

  if (action === "set_category") {
    const txId = params.get("txId");
    const cat = params.get("cat");
    if (!txId || !cat) return;
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) {
      await replyText(replyToken, "找不到該筆交易");
      return;
    }
    await db
      .update(transactions)
      .set({ category: cat, updatedAt: new Date() })
      .where(eq(transactions.id, txId));
    await replyText(replyToken, `✓ 已改為「${cat}」`);
    return;
  }

  if (action === "change_amount") {
    const txId = params.get("txId");
    if (!txId) return;
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) {
      await replyText(replyToken, "找不到該筆交易");
      return;
    }
    const current = Number(tx.amount);
    const candidates = [
      Math.max(1, Math.round(current * 0.5)),
      Math.max(1, Math.round(current - 100)),
      Math.max(1, Math.round(current)),
      Math.round(current + 100),
      Math.round(current * 1.5),
    ];
    const seen = new Set<number>();
    const unique = candidates.filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    const qr = quickReplyActions(
      unique.map((n) => ({
        label: String(n),
        data: `action=set_amount&txId=${txId}&amount=${n}`,
        displayText: String(n),
      })),
    );
    await replyText(replyToken, "請直接輸入新金額（例如 250）", qr);
    return;
  }

  if (action === "set_amount") {
    const txId = params.get("txId");
    const amountStr = params.get("amount");
    if (!txId || !amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      await replyText(replyToken, "金額無效");
      return;
    }
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) {
      await replyText(replyToken, "找不到該筆交易");
      return;
    }
    const oldAmount = Number(tx.amount);
    await applyDelta(tx.accountId, -signedAmount(tx.kind, oldAmount));
    await db
      .update(transactions)
      .set({ amount: amount.toFixed(2), updatedAt: new Date() })
      .where(eq(transactions.id, txId));
    await applyDelta(tx.accountId, signedAmount(tx.kind, amount));
    await replyText(replyToken, `✓ 已改為 NT$${amount}`);
    return;
  }

  if (action === "cancel_tx") {
    const txId = params.get("txId");
    if (!txId) return;
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) {
      await replyText(replyToken, "找不到該筆交易");
      return;
    }
    await applyDelta(tx.accountId, -signedAmount(tx.kind, Number(tx.amount)));
    await db.delete(transactions).where(eq(transactions.id, txId));
    const qr = quickReplyActions([
      { label: "再記一次", data: "action=again" },
      { label: "選單", data: "action=menu" },
    ]);
    await replyText(replyToken, t("tx_cancelled"), qr);
    return;
  }
}
