# Laiki 競品分析報告

> 日期: 2026-05-20
> 對象: 台灣家庭 / 朋友群 AI 記帳市場
> 產品定位: LINE Bot + LIFF 三層輸入 AI 記帳，個人 / 分帳 / 共同基金三模式並存

---

## 一、市場切片

台灣記帳工具大致五類:

1. **單機個人記帳 App** — 記帳城市、CWMoney、AndroMoney、Money+、碎碎念記帳
2. **分帳工具** — Splitwise、Tricount、Settle Up、拆拆 (Tally)
3. **銀行 / 電子支付內建** — 街口、LINE Pay、icash Pay、台新 Richart 自動分類
4. **發票導向** — 發票存摺、雲端發票、財政部 App
5. **LINE Bot / AI 對話式記帳** — 記帳雞、麻布記帳 (Moneybook 對話版)、ChatGPT + Google Sheet DIY、零零後個體戶開發的 LINE Bot

Laiki 同時打 1 + 2 + 5，差異化在「同一個入口同時做三件事 + 多 LLM BYOK」。

---

## 二、直接競品逐個拆

### 1. 記帳城市 (Fortune City) — Fourdesire

| 維度 | 細節 |
|---|---|
| 強項 | 把記帳 gamify，每筆變一棟建築。台灣裝機量最大，Z 世代黏著高 |
| 入口 | 純 App，手動表單為主 |
| AI | 弱，僅商家自動分類 |
| 分帳 | 無 |
| 群組 | 無 |
| 變現 | 訂閱 + 內購主題 |
| 對 Laiki 威脅 | **中**。佔據「快樂記帳」心智，但完全沒分帳與群組 |

**Laiki 反制**: 強調「分帳 + 個人 + 基金一站」、強調 LINE 不切換 App、強調拍照 + 對話免手動。

---

### 2. CWMoney / AndroMoney — 老牌厚重派

| 維度 | 細節 |
|---|---|
| 強項 | 欄位最完整 (子分類、專案、預算、報表)、Excel/CSV 匯出、多幣別 |
| 入口 | App，重表單 |
| AI | 無或極弱 |
| 分帳 | 部分有「成員」概念但不順 |
| 變現 | 廣告 + Pro 一次性買斷 |
| 對 Laiki 威脅 | **低**。使用者中位數 35+，重度自記，與 Laiki TA (LINE 重度家庭群) 不重疊 |

**Laiki 反制**: 不打報表深度，打對話速度。長期可補 CSV export (TODO 已列)。

---

### 3. Splitwise — 分帳之王

| 維度 | 細節 |
|---|---|
| 強項 | 全球分帳代名詞、min-transfer 結算、貨幣轉換、收據附件 |
| 入口 | App + Web，需要每個人裝 App |
| AI | 無，純表單 |
| LINE 整合 | 無 |
| 變現 | Pro $3/月 (圖表、收據掃描、無廣告) |
| 對 Laiki 威脅 | **高 (分帳場景)**。已有用戶基礎，但「全員裝 App + 註冊」高摩擦 |

**Laiki 反制**:
- 群組 Bot 進 LINE 群即可分帳，**零下載**
- 自動 register 群組任何發言成員，不需手動加好友
- 提供 fund 模式 (家庭共用錢包) Splitwise 無

---

### 4. Tricount / Settle Up — 旅遊分帳

| 強項 | 旅行短期專用、輕量、可匿名建群 |
| 弱項 | 不做長期記帳、不做個人帳、無 AI |
| 對 Laiki 威脅 | **低**，只在旅遊一次性場景強 |

---

### 5. 麻布記帳 (Moneybook)

| 維度 | 細節 |
|---|---|
| 強項 | 自動同步銀行 / 信用卡 / 證券 / 電支 (open API + 爬蟲)、信任度高 |
| 入口 | App + Web |
| AI | 自動分類 (規則式為主)、近期推對話 beta |
| 分帳 | 無 |
| 隱憂 | 需提供金融機構帳密，部分用戶不敢 |
| 對 Laiki 威脅 | **中高**。涵蓋「不想手動」場景，但無 LINE、無分帳、無共同基金 |

**Laiki 反制**:
- 不碰銀行密碼，隱私風險低
- 提供 BYOK 讓重度玩家用自己的 GPT/Claude/Ollama
- LINE 對話與群組原生

長期 Laiki 可考慮接 Open Banking (台灣財金開放 API 進度緩) 或發票存摺 OAuth。

---

### 6. 記帳雞 / 其他 LINE Bot 個體戶

| 強項 | 與 Laiki 同入口 (LINE)、輕量 |
| 弱項 | 多為個人專案，無 LIFF、無分帳、無多 LLM、無共享帳戶；UI 粗糙；常掛 |
| 對 Laiki 威脅 | **中**。先佔了「LINE 記帳」搜尋詞 |

**Laiki 反制**: 產品完整度 (帳戶 / 分帳 / 基金 / BYOK / 推播 / 預算 / Dashboard) 拉開代差。建 SEO / 內容站打中文「LINE 記帳機器人」關鍵字。

---

### 7. ChatGPT + Google Sheet DIY

| 場景 | 技術用戶自架 GPT Action 寫進 Sheet |
| 對 Laiki 威脅 | **低**。佔極客 < 1%，但這群剛好是 BYOK 目標。對他們 Laiki = 省下自架 |

**Laiki 反制**: 直接以 BYOK 收編。文案: 「你已有 GPT/Claude key？接進來，無上限。」

---

### 8. 發票存摺 / 雲端發票 / 統一發票對獎

| 強項 | 自動抓財政部電子發票、對獎、官方背書 |
| 弱項 | 只認電子發票條碼、紙本與現金不在內、無分帳 |
| 對 Laiki 威脅 | **低**，但**互補**。長期可串財政部 API 自動匯入發票，補齊「紙本 + 現金 + 電子發票 + AI 對話」四向 |

---

### 9. 銀行 App 自動分類 (Richart / 玉山 Wallet / 中信 Home)

| 強項 | 帳戶內交易自動有、不用記 |
| 弱項 | 只看得到本行交易、現金與他行刷卡不算、無跨人分帳 |
| 對 Laiki 威脅 | **低**。場景互補 |

---

## 三、定位象限

```
        高 AI 自動化
              │
       Laiki ●        ● 麻布記帳
              │
   ChatGPT ●  │
   DIY        │
              │
─────────────┼───────────────  分帳完整度
              │
              │ ● Splitwise / Tricount
   記帳城市 ●  │
   CWMoney  ● │
              │
        低 AI 自動化
```

Laiki 唯一位於右上角「高 AI + 分帳完整 + LINE 原生」象限。

---

## 四、Laiki 護城河與弱點

### 護城河
1. **零下載分帳**: LINE 群內 @bot 即用，對方不裝 App、不註冊。Splitwise 永遠跨不過這道
2. **三模式統一**: 個人 / 分帳 / 基金 同 schema、同帳戶、同 BYOK，切換零成本
3. **BYOK 多 LLM**: 重度玩家用自己 key 無上限；平台用戶免費 Gemini 50/30 月配額。雙軌商業
4. **共享帳戶 + 共同基金**: 家庭場景殺手鐧。配偶共用信用卡分享、家庭旅遊基金池，市面上同時做這兩個的 = 0
5. **拍照 + 對話 + 表單** 三層輸入完整
6. **推播 jobs**: 週報、月結、流失 nudge 已內建

### 弱點
1. **單一通路依賴 LINE**: 政策變動或拒絕 verify 即崩。需第二通路 (Web PWA / iMessage / Telegram) 備援
2. **金融自動同步未做**: vs 麻布記帳 / 銀行 App 弱
3. **無台灣電子發票對接** (財政部 API 未串)
4. **無多幣別 / 國際擴展**
5. **品牌與獲客**: 個體戶階段，需建內容 + 社群冷啟
6. **資料導出**: CSV / Excel export 尚未做，長期重度用戶會擔心 lock-in
7. **無 iOS / Android 原生 widget** — 鎖屏快捷記帳體驗輸 App 派

---

## 五、市場機會總結

- 台灣 LINE 滲透 > 95%，「LINE 內記帳」是大藍海，但目前只有低品質個體 bot 佔位
- 家庭共同基金 + 配偶共用信用卡 = 完全空白市場
- Z 世代習慣 Splitwise 分帳但抱怨「不是每個人都裝」— Laiki 直接吃下這痛點
- BYOK 模式可吸引高消費力極客，提供「家用 Claude key 多場景」說服力

---

# 商業化 TODO

> 目標: 從個人作品 → 可付費 SaaS。分四階段。

## Phase 0 — 上線前 Hardening (1-2 週)

### P0-1 法律 / 合規
- [ ] 個資告知頁 (PDPA) 內容補完，明確列「我們不存銀行密碼、訊息僅暫存、BYOK 加密儲存」
- [ ] Terms 增加「禁止違法收支記錄」「服務無金融建議性質」「LINE 平台變動風險」
- [ ] Cookie / Session 同意 banner (LIFF 內可省，Web landing 需要)
- [ ] BYOK 條款: 用戶 key 用量責任歸屬聲明
- [ ] 兒少: 限 13+ 使用 (LINE 條款相符)

### P0-2 可觀測 / 維運
- [x] pino structured logging、`/metrics` Prometheus — 已完成
- [ ] Grafana / Uptime kuma 接 `/metrics` 與 `/api/health`，設 SLO 告警
- [ ] Sentry (server + LIFF) 接 error
- [ ] LINE webhook 失敗重試與 DLQ (postgres queue 即可)
- [ ] DB 自動備份 (daily pg_dump → S3 / B2) + 還原演練
- [ ] 速率限制現為 in-memory，多副本部署前換 Redis token bucket

### P0-3 品質
- [ ] balances.test.ts (TODO 已列) — 用 testcontainers
- [ ] retry.test.ts 修 flaky
- [ ] e2e: LINE webhook 假事件 → 預期 DB 狀態 (用 supertest)
- [ ] LIFF Playwright smoke test (主路徑 5 條)

---

## Phase 1 — 變現基礎 (2-4 週)

### P1-1 訂閱 / 計費
- [ ] Plan 分三層:

| Plan | 月費 | parse | recognize | 群組數 | 帳戶數 | 自動發票匯入 | 廣告 |
|---|---|---|---|---|---|---|---|
| Free | 0 | 50 | 30 | 3 | 5 | ✗ | LIFF 底部 banner |
| Plus | NT$59 | 500 | 300 | 無限 | 無限 | ✓ (上線後) | 無 |
| Pro / BYOK | NT$0 (帶自己 key) | 無限 | 無限 | 無限 | 無限 | ✓ | 無 |

- [ ] schema: `subscriptions { user_id PK, plan, status, current_period_end, provider, provider_sub_id }`
- [ ] 串金流: 綠界 / 藍新 / TapPay 訂閱定期定額 (台灣本地)；國際備援 Stripe
- [ ] quota.ts 加 plan 維度
- [ ] LIFF `/upgrade` 頁: 三層卡片 + 我的方案 + 取消訂閱
- [ ] Webhook 處理: 續訂成功、失敗、退訂、退款
- [ ] 月底結算 + 發票開立 (台灣電子發票 API: 綠界 / 藍新代開)

### P1-2 推薦 / Referral
- [ ] 推薦碼: 邀請新用戶綁定送 +100 parse + 30 recognize/月，連送 3 個月
- [ ] LINE Flex 一鍵分享卡，深連結帶 ref code
- [ ] 防刷: 同裝置 / 同 IP / 同卡計入風控

### P1-3 BYOK 商業化
- [ ] BYOK 用戶免費，但鼓勵升 Plus 解鎖「進階週報 + 自動電子發票 + 多幣別」
- [ ] 加 provider: groq / deepseek / xAI grok / moonshot kimi (中文便宜)
- [ ] BYOK 用量 dashboard，顯示「你本月省下多少 NT$」(對比 Plus 訂閱)

---

## Phase 2 — 增長 (1-3 月)

### P2-1 SEO / 內容
- [ ] landing `/laiki` 升級成 SEO landing
  - H1 「LINE 上的 AI 記帳機器人 — 個人 / 分帳 / 家庭基金」
  - 關鍵字: `LINE 記帳機器人`、`AI 分帳`、`家庭共同基金 App`、`Splitwise 中文替代`
- [ ] 部落格 `/blog`:
  - 「Splitwise 中文版？來記給你 LINE 內直接分帳」
  - 「家庭共用錢包怎麼記？共同基金教學」
  - 「拍照記帳 vs 對話記帳 vs 手動，誰準？」
  - 「BYOK: 把 Claude API key 接進記帳」
  - 每篇含 deep link 到 LIFF
- [ ] sitemap + GA4 + Search Console
- [ ] OG image 自動產 (`og.png` per route)

### P2-2 社群冷啟
- [ ] PTT MoneyManage / Splitwise 板發測試招募
- [ ] Dcard 理財板、家庭板分享文
- [ ] Threads / X 短影片: 對話 → Flex 卡 → 結算 15 秒 demo
- [ ] 與台灣理財 KOL (柴鼠 / Min 財商 / Mr.Market) 合作體驗稿
- [ ] Product Hunt 上 (英文版 landing 先做)

### P2-3 LINE 官方資源
- [ ] 申請 LINE Verified Account (綠盾)，解鎖:
  - 群組成員 API (補完 TODO 「Group verified sync」)
  - 出現在 LINE 官方帳號搜尋
- [ ] 申請 LINE Pay 商家接 LINE Pay 自動扣訂閱費
- [ ] 申請 LINE Notify / LINE 廣告投放 (跑 LAP)

### P2-4 北極星指標
- [ ] 定義: **週活躍記帳用戶 (WAU-logged)** = 過去 7 天至少 1 筆交易的 user
- [ ] 留存目標: D7 ≥ 40%, D30 ≥ 25%
- [ ] 變現目標: 上線 90 天付費轉換 ≥ 3%、ARPPU ≥ NT$55

---

## Phase 3 — 產品差異化深化 (3-6 月)

### P3-1 金融整合
- [ ] 串 **財政部電子發票 API** (載具歸戶 → 自動匯入發票)
  - 預估 = 殺手級，台灣獨家賣點
- [ ] 街口 / LINE Pay / 悠遊付 帳單 OCR 一鍵匯入
- [ ] 信用卡帳單 PDF 上傳 → AI 拆解 (vision LLM 已具備)

### P3-2 家庭場景擴張
- [ ] 親子帳戶 (子女虛擬零用錢、父母撥款、目標儲蓄)
- [ ] 家庭月度報告 PDF 自動寄信
- [ ] 共同基金 → 「目標型基金」(旅遊金/婚禮金/購屋金，達標慶祝 Flex)

### P3-3 進階 AI
- [ ] 對話式查詢: 「上個月我花最多在哪？」「我這禮拜外食幾次？」
  - LLM + DB tool calling
- [ ] 異常偵測: 訂閱費漲價、重複扣款、夜間異常刷卡推播
- [ ] 預算建議: 根據歷史自動建議下月預算

### P3-4 多通路備援
- [ ] Web PWA 版 (脫離 LIFF 也能用，降低 LINE 依賴)
- [ ] Telegram Bot 鏡像 (海外華人)
- [ ] iOS Share Sheet extension (從相簿 / Safari 直接記)
- [ ] iOS / Android Widget (鎖屏快捷記帳)

### P3-5 資料可攜
- [ ] CSV / Excel export
- [ ] Google Sheet 雙向同步 (Plus 限定)
- [ ] Notion DB 同步 (Plus 限定)

### P3-6 國際化
- [ ] 多幣別 + 即時匯率 (exchangerate.host)
- [ ] 日 / 英 i18n (日本 LINE 用戶 8000 萬)
- [ ] 日本市場本地化: PayPay / 樂天 Pay OCR、消費稅自動拆

---

## Phase 4 — B2B / 平台化 (6-12 月)

### P4-1 中小企業差勤 / 報帳
- [ ] 群組型企業帳本: 員工 LINE 拍收據 → 主管審核 Flex → 自動入 ERP
- [ ] 串 接 Xero / 雲端發票 / 報帳系統
- [ ] 月費 per seat NT$199

### P4-2 銀行 / 信用卡聯名
- [ ] 與台新 / 玉山 / 永豐合作: 數位帳戶開戶送 Plus 1 年
- [ ] 信用卡刷卡推播 webhook 接 Laiki 自動記帳

### P4-3 開放 API / 平台
- [ ] Public API: 第三方可建自家分帳 Bot 用 Laiki 結算引擎
- [ ] MCP server: Claude Desktop / ChatGPT 直接查記帳
- [ ] Webhook 訂閱 (記帳事件 → Zapier / Make)

---

## 風險 / 待釐清

| 風險 | 緩解 |
|---|---|
| LINE 政策變動 (verified 拒絕 / 收費調整) | Phase 3 Web PWA + Telegram 備援；不把雞蛋全放 LINE |
| 平台 LLM 成本爆 | Gemini Flash Lite 已最便宜；BYOK 路線轉嫁；Ollama self-host 後路 |
| 個資外洩 | 加強 AES IV per row、BYOK 不留明文、定期 pentest、第三方資安顧問一次 |
| 競品大廠跟進 (Fortune City 出分帳；麻布出 LINE Bot) | 速度 + 家庭場景深度 + BYOK 三點先卡位 |
| 法規: 第三方金流 / 電子支付 | 不碰實際收付款 (用戶之間結算為「資訊紀錄」)，避免被歸類為電支業 |
| 商標 / 名稱 | 「來記 Laiki」搜尋確認無衝突，正式上前申請台灣商標 |

---

## 立即下一步 (本月)

1. 上 Sentry + 自動備份 + e2e smoke (P0-2 / P0-3 三項)
2. 寫 landing SEO 文案 + 開部落格 (P2-1)
3. 設計 Plan 三層 + 串綠界訂閱 (P1-1)
4. 申請 LINE Verified (P2-3)
5. 找 3 個家庭 / 3 個朋友群 closed beta，每週訪談 30 分
