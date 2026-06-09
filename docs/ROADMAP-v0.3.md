# Roadmap v0.3 — 從「只會記帳」到「會回答 + 會操作」

## Context

v0.2 完成 1對1 + 影子帳號 pivot：記帳（文字/收據/分帳/基金/轉帳）、好友/待收款、群組管理都通了。

但目前 bot **只懂記帳**。使用者自然會「問問題」和「下指令」，系統沒有 intent 分類層：
- 「今日花費」→ 被當記帳，金額 null，跑去問「多少錢？」（實際是查詢）
- 「刪掉最後一筆」→ 無法
- 「提醒姿盈還錢」→ 無法

核心架構缺口：**每句話先分流成 記帳 / 查詢 / 操作 三類**，再進對應 handler。`餘額`/`本月`/`吞金獸餘額` 目前是寫死的特例，不可擴展。

---

## P0 — 自然語言查詢層（最高價值，直接解決痛點）

**目標**：「今日花費」「這週吃多少」「餐飲花多少」「上個月比較」「最大一筆」→ 回統計卡，不誤判成記帳。

設計：
- 新 `ai/classifyIntent.ts`：parse 前先分流 `record | query | command`。可先用規則（疑問詞「多少/花了/查/嗎」+ 無明確新增語意）+ LLM fallback。
- 新 `ai/parseQuery.ts`：query → 結構化 `{ metric: spend|income|count, period: today|week|month|range, category?, account?, group?, compare? }`（discriminated schema，沿用 unifiedSchema 模式）。
- 新 `lib/queryEngine.ts`：把結構化 query 跑成 SQL 聚合（重用 `commands.ts` 既有月結/分類邏輯）。
- 新 `flex/queryResult.ts`：Bento 卡（金額大字 + 期間 + top 分類 + 環比）。
- `message.ts`：classifyIntent → query 走查詢、record 走現有 parseUnified。

可重用：`commands.ts` personalMonthlyData/byCategory、`routes/liff/overview.ts` 聚合、`flex/monthly.ts`。

代表查詢（驗收）：今日/本週/本月花費、某分類花多少、環比、最大一筆、某帳戶餘額（已有）、某基金餘額（已有）。

## P1 — 對話中編輯/刪除

**目標**：不開 LIFF 就能改最近的帳。

- 「刪掉最後一筆」「撤銷」→ 刪除最近一筆 tx（+ 反向 applyDelta，沿用 transferPairId 一起刪）。
- 「剛剛那筆改成500」「上一筆改餐飲」→ 改最近 tx 金額/分類/帳戶。
- 新 `lib/recentTx.ts`（已有 `recentTxs.ts` 雛形）：每使用者最近 N 筆 + 撤銷 token。
- intent=command 分支處理；回確認卡。
- 風險：「最近一筆」定義（時間 vs 操作序）— 用 createdAt desc + 30 分鐘 undo 窗。

## P2 — 債務提醒 + 主動通知

**目標**：把待收款變成會主動催的系統。

- 「提醒姿盈還錢」→ 若已綁定，推催收卡給對方（含金額 + LINE Pay 連結佔位）；未綁定 → 回邀請碼。
- 既有 job 擴充：`budgetWarn.ts` 預算快超 → 推播；`weeklyInsight.ts`/`monthlySettle.ts` 已有，補「本月待收款摘要」。
- 新 `lib/reminders.ts`：催收頻率限制（同一債務 24h 一次）。

## P3 — 對話建定期交易

**目標**：「每月房租15000」「每週一還信用卡」→ 自動建 recurring（目前只能 LIFF）。

- unifiedSchema 加 `recurring` 偵測（frequency + anchor）。
- 重用 `recurringRunner.ts` + `lib/recurring.ts` 既有 schema/排程。

## P4 — 收據逐項拆分 + 多幣別

- 收據多品項 → 可選逐項記帳/分帳（unified schema 已有 items 概念，UI 補）。
- 多幣別：交易加 currency + 匯率，海外手續費自動算（「Claude訂閱632+1.5%」已驗證 LLM 會算，但沒存幣別）。

## P5 — 對話內搜尋/歷史

- 「找麥當勞的紀錄」「上次加油多少」→ NL 搜尋 tx，回列表卡。
- 屬 P0 查詢層的延伸（metric=list + 關鍵字）。

---

## 建議順序

P0（查詢層）→ P1（編輯刪除）→ P2（提醒）。P0 是地基：intent 分類 + 結構化查詢 schema 一旦建好，P5 搜尋幾乎免費，P1/P2 的 command 分支也共用同一層。

## 驗收/測試

- 沿用 L1（schema/classifier 純函式）+ L3（sim：「今日花費」回卡不記帳）+ L4（golden 加查詢句，量 intent 分類準確率）。
- 每個 P 結尾：`cd server && npm test` 全綠 + eval 重跑。
