# TODO

## ✅ Completed

### M0–M12 — 基礎功能
全部完成。詳見 README.md 的「里程碑」與「功能」段落。

### UX P0 ✅
- [x] Flex confirm Quick Reply: 改分類 / 改金額 / 再記一筆
- [x] 手動新增帶預填 (錯誤卡 URL `?text=...`)
- [x] 推播偏好設定 (schema + LIFF Settings + jobs 過濾)

### UX P1 ✅
- [x] LIFF 底部 tab bar (首頁/帳戶/群組/設定)
- [x] 群組 join 體驗 (postback 後加範例 + 群組訊息附名單 + groupMembersText 加邀請連結)
- [x] Dashboard BYOK CTA + 本月省配額統計
- [x] ApiKey 自動載入 model 列表 (debounce 600ms)
- [x] Tx 編輯返回原處 (`?from=`)

### UX P2 ✅
- [x] 拍照 carousel 批次 (60s 內多張 → Flex carousel)
- [x] 拍照成功 Quick Reply (再傳一張/改分類/改帳戶)
- [x] 基金「誰存了多少」postback `fund_contributions`
- [x] fundTx Flex 顯示累計貢獻 (fund_in)
- [x] fund_out 預設分類 (儲蓄 / 基金支出)
- [x] i18n 日期格式統一 (fmtDate / fmtMoney)
- [x] Onboarding Flex Quick Reply (試打字 / 設定 / 帳戶)
- [x] Onboarding 3-步 checklist + CTA

### UX P3 ✅
- [x] 取消交易 Quick Reply (再記一次 / 選單)
- [x] 分享帳戶 push 通知對方
- [x] 聯絡人 source 標示 (viaGroups)
- [x] LIFF ErrorBox + retry
- [x] AccountDetail 最後使用時間
- [x] Header 麵包屑 (Header.tsx) - 全頁面套用
- [x] 連續記帳模式 (TxNew checkbox)

### Priority 1 — 穩定性 ✅
- [x] 單元測試 (vitest, 40+ tests)
  - settle / crypto / retry / parseTransaction zod
  - balances skipped (需 DB mock)
- [x] LLM fallback chain (FallbackProvider)
- [x] 平台級 OpenAI / Anthropic key
- [x] Rate limiting (webhook 60/min, /api/ 120/min)
- [x] Input length 限制 (note 500, category 32, name 50/60)
- [x] Image size 限制 (10MB)

### Priority 2 — 缺失功能 ✅
- [x] 預算: schema + CRUD + LIFF UI + daily 20:00 warn job
- [x] Dashboard 6 個月趨勢 chart (純 Tailwind 雙色 bar)
- [x] 群組名稱 LIFF 編輯 UI (PATCH + pencil button)

### Priority 3 — 體驗 ✅
- [x] 拍照辨識準確率優化 (台灣發票 / 民國年 / 全形 / 多語 prompt)
- [x] `liff.state` 安全處理 (外部 URL 拒絕)
- [x] Profile pic / displayName / email 每次 auth 同步
- [x] Settle UI 帳戶選擇 Quick Reply (`record_paid` postback)

### Priority 4 — Hardening ✅
- [x] Extract LIFF_BASE / BOT_BASIC_ID / quotas / TZ 到 lib/config.ts
- [x] Ollama capability cache (5min TTL)
- [x] groups.lineGroupId 部分 UNIQUE index (migration 0006)
- [x] ai_insights.insights TypeScript interface
- [x] resolveAccount 早退 + last4 shortcut
- [x] listUserAccounts SQL UNION (取代 in-memory dedup)
- [x] Structured logging (pino) + request ID middleware
- [x] Metrics endpoint (`/metrics` Prometheus format)
  - parse_total, recognize_total, parse_errors, recognize_errors, settle_total, webhook_total, api_5xx

---

## 🔜 待外部依賴 / 後續

### 需設計師 / 上傳資源
- [ ] Rich Menu 圖檔 (jpg 上傳 via `setRichMenuImage`)

### 需 LINE Verified channel 升級
- [ ] Group verified sync (`getGroupMembersIds` 自動同步全名單)

### 進階 (低優先)
- [ ] 多幣別 (currency conversion)
- [ ] CSV export / import
- [x] 規律性交易 (定期定額)
- [ ] 預存款餘額預測
- [ ] Apple Pay / Google Pay NFC 偵測
- [ ] LIFF dark mode
- [ ] 商家 logo 自動辨識 (從 merchant name)
- [ ] balances.test.ts (需 DB mock 或測試 container)
- [ ] retry.test.ts 修復 flaky timing 測試
