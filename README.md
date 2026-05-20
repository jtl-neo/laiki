# 來記 Laiki

> 給台灣家庭的 AI 記帳機器人。LINE Bot + LIFF + 多帳戶 + 群組分帳 + 共同基金。支援 Gemini / OpenAI / Anthropic / Ollama 多 LLM provider。

- Public: `https://app.heyinna.com/laiki`
- LIFF: `https://liff.line.me/2010125731-4UWhwDmk`
- LINE Bot: `@280onoms`

## 三層輸入

```
拿到收據 / 紙本？      → 拍照辨識 (Vision LLM)   3 秒
純現金 / 想說一句？    → 自然語言輸入 (LINE 對話)  一行字
要精準控制每個欄位？   → LIFF 表單手動建立 / 編修  完全可控
```

AI 結果**永遠可在 LIFF 編輯**：金額、日期、分類、帳戶、分帳明細、備註，全欄位可調。

每筆交易必綁一個**帳戶** (cash/debit/credit/bank/ewallet)，支援帳戶間轉帳，自動同步餘額。

## 三種帳本模式

| 模式 | 場景 | 紀錄方式 | 結算 |
|---|---|---|---|
| **個人記帳** (預設) | 自己一人 | 對自己帳戶 +/- | 月度統計 |
| **群組分帳** (`type=shared`) | 朋友 / 同事 AA | 出錢者帳戶 -，其他人記分帳 | min-transfer 結算 |
| **共同基金** (`type=fund`) | 家庭共用錢包、出國旅遊基金 | 對群組共用「基金池」帳戶 +/- | 直接看池餘額 |

Bot 加入 LINE 群組後回 Flex picker 讓你選分帳模式。共同基金會自動建專屬池帳戶並 share 給所有成員。

## 介面

| Surface | 用途 |
|---|---|
| **LINE 1-on-1 Bot** | 對話記帳、拍照辨識、選單、快捷指令、推播 |
| **LINE 群組 Bot** | @Bot 分帳 / 存入 / 支出、結算、餘額查詢 |
| **LIFF (Web)** | 帳戶管理、轉帳、分帳編輯、BYOK、設定、Dashboard |

## 操作指南

### 加入機器人 (1-on-1)
1. 加 `@280onoms` 為好友
2. follow 事件: 自動建 user + 預設群組「我的記帳」+ 預設帳戶「錢包現金」
3. 收 onboarding Flex，點按鈕進 LIFF

### 對話式記帳
直接打字:
```
早餐 65 LINE Pay
午餐 牛肉麵 180 現金
房租 18000 中信
```
Bot 流程: showLoading → AI parse (含 retry) → 配額檢查 → 模糊比對帳戶 → 寫入 + applyDelta → Flex 卡片含 [編輯] [取消] + 帳戶 Quick Reply (可切換帳戶)。

### 拍照記帳
傳收據圖片 → Vision LLM OCR → 結構化 (amount/date/merchant/category/items) → Flex 確認卡。

### 對話指令 (1-on-1)
| 指令 | 行為 |
|---|---|
| `選單` / `menu` | Flex menu (餘額/本月/帳戶/新增/轉帳/API Key/設定) |
| `餘額` | 各帳戶餘額 + 合計 |
| `本月` | 月支出/收入/TOP 5 分類 |

### 加入群組
1. LINE 群組邀請 Bot
2. Bot 回 picker Flex: `[群組分帳]` / `[共同基金]`
3. 選後:
   - **分帳**: 群組名沿用 LINE 群組名
   - **基金**: 自動建 `{群組名} 基金池` 帳戶 + share 給所有現任成員

### 群組指令 (`@bot 指令`)
| 指令 | 行為 |
|---|---|
| `@bot` (空) | 直接回 group menu |
| `@bot 火鍋 1200 信用卡` | 記交易 (shared: 平分, fund: fund_out) |
| `@bot 選單` | Group menu |
| `@bot 結算` / `月結` | min-transfer 建議 |
| `@bot 餘額` | 每人欠收狀態 / 基金池餘額 |
| `@bot 名單` / `成員` | 已登記成員 |

**注意**: 只有 mention bot (`@bot`) 才觸發。`@all` 或 mention 其他人都不會。任何成員在群組發言會自動被 register (不需手動加好友才有資料)。

### LIFF
- `/` → `/dashboard` 主頁
- `/dashboard` profile / 4 快捷 / 本月卡 + 分類 bar chart / 最近 5 筆 / 帳戶 / 群組
- `/accounts` 列表 (含分享來的), FAB 新增
- `/accounts/:id` 餘額 / 交易明細 / 分享 UI / 改名 / 封存
- `/transfer` 帳戶間轉帳
- `/group/:groupId` 成員 / 餘額 / 結算
- `/group/:groupId/tx` 交易列表
- `/group/:groupId/tx/new` 新增 (fund 模式自動鎖 fundAccountId)
- `/tx/new` 快速新增
- `/tx/:txId/edit` 編輯 (含 SplitEditor)
- `/apikey` BYOK 多 provider
- `/settings` 設定 / 登出

### 分享帳戶
A 的信用卡可分享給 B 也能記帳:
- `/accounts/:id` → 「分享給」section → `[+ 加入]` → 從聯絡人 (共群組成員) 選人
- B 列表會看到該卡，可對它記帳 (`canAccessAccount` 判斷)
- Owner 可移除任何 editor; editor 可自離

### BYOK (多 LLM Provider)
- `/apikey`: provider 下拉 (gemini/openai/anthropic/ollama)
- 各 provider 輸入: key (ollama 可空) + 可選 endpoint (ollama) + 可選 model
- `[取得模型列表]` 按鈕 — 動態抓 provider 的可用 model，標記 vision 支援
- 儲存前 verify (各 provider 有 ping endpoint)
- AES-256-GCM 加密 → `user_api_keys` (composite PK `(user_id, provider)`)
- 多 provider 並存; 設預設; recognize 自動降到 vision-capable provider

### 推播 Jobs (TZ Asia/Taipei)
| Job | 排程 | 行為 |
|---|---|---|
| `weeklyInsight` | 週日 21:00 | 各群組 AI 週報，存 ai_insights，push Flex 給 owner |
| `monthlySettle` | 每月 1 日 09:00 | 各群組推結算 Flex |
| `churnNudge` | 每日 19:00 | 7 天無交易者推友善提醒 |

## 技術棧

```
┌──────────────────────────────────────────────────────────────┐
│  https://app.heyinna.com/laiki                               │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│  Host Caddy (caddy-manager/routes/heyinna.yaml)              │
│    /laiki/api/*      → strip /laiki → server :18101         │
│    /laiki/webhook/*  → strip /laiki → server :18101         │
│    /laiki/*          → strip /laiki → liff-app :28100       │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
        ┌─────────────┴──────────────┐
        ↓                            ↓
┌────────────────┐         ┌────────────────────┐
│ liff-app       │         │ server             │
│ Vite + React19 │         │ Hono + Drizzle     │
│ LIFF SDK v2    │         │ TypeScript + zod   │
│ TanStack Query │         │ postgres-js        │
│ react-router   │         │ node-cron          │
│ Tailwind       │         └──┬──────────┬──────┘
└────────────────┘            │          │
                              ↓          ↓
                  ┌────────────┐   ┌─────────────────────┐
                  │ db (pg 16) │   │ LLM Providers       │
                  │            │   │  • Gemini           │
                  └────────────┘   │  • OpenAI           │
                                   │  • Anthropic        │
                                   │  • Ollama (local)   │
                                   └─────────────────────┘
                                          ↓
                                   ┌──────────────┐
                                   │ LINE Msg API │
                                   └──────────────┘
```

- **Server**: Node 22 + Hono + TypeScript + Drizzle + postgres-js + zod + node-cron
- **LIFF**: Vite + React 19 + TypeScript + Tailwind + TanStack Query + LIFF SDK v2 + react-router
- **LLM**: 共通 `AIProvider` 介面 + 4 adapters (gemini/openai/anthropic/ollama)
- **Container**: Docker Compose (db / server / liff-app / landing)
- **Reverse proxy**: Host Caddy (caddy-manager YAML)

## 倉庫結構

```
laiki/
├── server/
│   ├── src/
│   │   ├── index.ts                        # Hono entry + startJobs
│   │   ├── db/{schema,client,migrate,seed}.ts
│   │   ├── routes/
│   │   │   ├── webhook/line.ts             # LINE webhook dispatcher
│   │   │   ├── liff/{auth,me,summary,contacts}.ts
│   │   │   ├── accounts.ts                 # CRUD + members (分享) + transactions
│   │   │   ├── transfers.ts
│   │   │   ├── transactions.ts             # CRUD + splits
│   │   │   ├── groups.ts                   # CRUD + members
│   │   │   ├── balances.ts                 # 群組欠款
│   │   │   ├── settle.ts                   # min-transfer + record-paid
│   │   │   ├── apikey.ts                   # BYOK 多 provider + models
│   │   │   └── ai/{parse,recognize,insights}.ts
│   │   ├── line/
│   │   │   ├── client.ts                   # messagingApi + blob
│   │   │   ├── reply.ts                    # replyText / replyMessages / showLoading / quickReplyActions / flexWithQuickReply
│   │   │   ├── registerParticipant.ts      # 群組任何發言自動 upsert user + member
│   │   │   ├── groupName.ts                # getGroupSummary 包裝
│   │   │   ├── syncGroup.ts                # (verified 用) getGroupMembersIds
│   │   │   ├── commands.ts                 # personalBalance / personalMonthly / groupBalancesText / groupSettleText / groupMembersText
│   │   │   ├── handlers/
│   │   │   │   ├── follow.ts / unfollow.ts
│   │   │   │   ├── join.ts / leave.ts / memberJoined.ts
│   │   │   │   ├── message.ts              # text (1-on-1 + group) — 含 fund mode
│   │   │   │   ├── image.ts                # 拍照辨識
│   │   │   │   └── postback.ts             # 所有 postback action
│   │   │   └── flex/
│   │   │       ├── onboarding.ts
│   │   │       ├── txConfirm.ts            # 一般交易確認
│   │   │       ├── fundTx.ts               # 基金交易確認
│   │   │       ├── transfer.ts             # 轉帳卡
│   │   │       ├── settle.ts               # 結算卡
│   │   │       ├── insight.ts              # 週報卡
│   │   │       ├── menu.ts                 # 個人 / 群組 (區分 fund/shared)
│   │   │       ├── groupTypePicker.ts      # join 後選分帳/基金
│   │   │       ├── groupSync.ts            # invite Flex (verified 用)
│   │   │       ├── error.ts                # 錯誤卡 + 手動新增
│   │   │       └── richMenu.ts
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── types.ts                # AIProvider 介面 + JsonSchema + ModelInfo
│   │   │   │   ├── factory.ts
│   │   │   │   ├── gemini.ts / openai.ts / anthropic.ts / ollama.ts
│   │   │   ├── parseTransaction.ts         # 文字 → 結構化交易
│   │   │   ├── recognizeReceipt.ts         # 圖片 → 結構化交易
│   │   │   └── weeklyInsight.ts            # 週報生成
│   │   ├── lib/
│   │   │   ├── auth.ts / sessions.ts
│   │   │   ├── crypto.ts                   # AES-256-GCM
│   │   │   ├── ensureDefaults.ts           # user 預設群組 + 帳戶
│   │   │   ├── retry.ts                    # exp backoff (5xx/429)
│   │   │   ├── settle.ts                   # min-transfer
│   │   │   ├── balances.ts                 # computeBalances
│   │   │   ├── accountDelta.ts             # 帳戶餘額異動
│   │   │   ├── quota.ts                    # BYOK / 平台 / vision fallback
│   │   │   ├── resolveAccount.ts           # canAccessAccount + listUserAccounts + 模糊比對
│   │   │   └── i18n.ts
│   │   └── jobs/{weeklyInsight,monthlySettle,churnNudge,index}.ts
│   ├── scripts/setupRichMenu.ts            # `npm run line:richmenu:setup`
│   ├── drizzle/                            # migrations 0000 / 0001 / 0002 / 0003
│   ├── drizzle.config.ts
│   └── Dockerfile
│
├── liff-app/
│   ├── src/
│   │   ├── main.tsx                        # BrowserRouter basename="/laiki"
│   │   ├── App.tsx                         # 13 routes
│   │   ├── liff.ts                         # initLiff + liff.state 處理 + api()
│   │   └── screens/
│   │       ├── Dashboard.tsx               # profile / 快捷 / 本月卡 / bar chart / 最近 / 帳戶 / 群組
│   │       ├── Accounts.tsx / AccountDetail.tsx  # 含分享 UI
│   │       ├── Transfer.tsx
│   │       ├── GroupDetail.tsx / TxList.tsx
│   │       ├── TxNew.tsx                   # 含 fund 模式自動鎖
│   │       ├── TxEdit.tsx
│   │       ├── SplitEditor.tsx             # 元件
│   │       ├── ApiKey.tsx                  # 多 provider + 模型列表
│   │       ├── Settings.tsx / Onboarding.tsx
│   ├── vite.config.ts                      # base: '/laiki/'
│   └── Dockerfile
│
├── landing/                                # 靜態 index/privacy/terms
├── docker-compose.yml                      # 含 extra_hosts: host.docker.internal:host-gateway
├── .env / .env.example
├── TODO.md
└── README.md
```

## LIFF 路由

```
/                              → Navigate /dashboard
/dashboard                     → 主頁
/accounts                      → 帳戶列表 (own + shared)
/accounts/:id                  → 單帳戶明細 + 分享 UI
/transfer                      → 帳戶間轉帳
/group/:groupId                → 群組詳情 + 結算入口
/group/:groupId/tx             → 群組交易列表
/group/:groupId/tx/new         → 群組新增交易 (fund 模式自動鎖)
/tx/new                        → 快速新增
/tx/:txId/edit                 → 編輯
/apikey                        → BYOK 多 provider
/settings                      → 設定
/onboarding                    → 加好友 onboarding
```

## API 端點 (39 個)

所有 `/api/v1/*` 需 LIFF session (cookie `laiki_session`)。`/webhook/line` 需 LINE 簽章。

### Auth / LIFF
- POST `/api/v1/liff/auth` — idToken → session + ensureUserDefaults
- GET `/api/v1/liff/me` — user + groups + accounts + byok
- POST `/api/v1/liff/logout`
- GET `/api/v1/liff/summary` — 本月卡 (expense/income/topCategories/recent)
- GET `/api/v1/liff/contacts` — 共群組聯絡人 (用於分享 picker)

### Webhook
- POST `/webhook/line`

### Accounts
- GET / POST `/api/v1/accounts`
- GET / PATCH / DELETE `/api/v1/accounts/:id`
- GET `/api/v1/accounts/:id/transactions`
- GET / POST `/api/v1/accounts/:id/members`
- DELETE `/api/v1/accounts/:id/members/:userId`

### Transfers
- POST `/api/v1/transfers`

### Groups / Settle / Balances
- GET / POST `/api/v1/groups`
- GET / PATCH `/api/v1/groups/:id`
- GET / POST `/api/v1/groups/:id/members`
- DELETE `/api/v1/groups/:id/members/:userId`
- GET `/api/v1/groups/:id/balances`
- GET `/api/v1/groups/:id/settle`
- POST `/api/v1/groups/:id/settle/record-paid`

### Transactions
- GET `/api/v1/transactions?groupId=...`
- POST `/api/v1/transactions`
- GET / PATCH / DELETE `/api/v1/transactions/:id`

### AI
- POST `/api/v1/ai/parse`
- POST `/api/v1/ai/recognize`
- GET `/api/v1/groups/insights/:groupId/latest`

### BYOK
- GET `/api/v1/apikey` — list keys + defaultProvider
- POST `/api/v1/apikey` — upsert per provider (verify + encrypt)
- DELETE `/api/v1/apikey/:provider`
- PUT `/api/v1/apikey/default`
- POST `/api/v1/apikey/models` — 動態 list provider models

## Schema (13 表)

```ts
users { id, line_user_id UK, display_name, picture_url, email, locale }
groups { id, type, name, line_group_id UK?, owner_user_id, default_split, currency, fund_account_id }
group_members { group_id, user_id, role, joined_via, PK(group_id,user_id) }
accounts { id, user_id, name, type, last4, currency, balance, initial_balance, icon, color, archived_at? }
account_members { account_id, user_id, role, PK(account_id,user_id) }    -- 分享
transactions { id, group_id, account_id, amount, tx_date, paid_by_user_id, category, kind, note, source, ai_confidence?, transfer_pair_id? }
transaction_splits { transaction_id, user_id, amount, PK(transaction_id,user_id) }
settlements { id, group_id, from_user_id, to_user_id, from_account_id?, to_account_id?, amount, paid_at, note }
user_api_keys { user_id, provider, encrypted_key, encryption_iv, key_hint, endpoint?, model?, verified_at, last_used_at?, PK(user_id,provider) }
user_preferences { user_id PK, default_provider }                                -- 預設 LLM provider
ai_usage { user_id, month, parse_count, recognize_count, PK(user_id,month) }
ai_insights { id, group_id, period_start, period_end, insights jsonb }
sessions { id PK, user_id, expires_at }
```

Enums: `group_type`, `split_method`, `member_role`, `joined_via`, `account_type`, `account_member_role`, `tx_kind` (含 `fund_in`/`fund_out`/`transfer`), `tx_source`, `api_key_provider` (gemini/openai/anthropic/ollama)。

## 配額

| 行為 | 平台 key (預設 Gemini) | BYOK |
|---|---|---|
| 月 AI parse | 50 | 無限 |
| 月 AI recognize | 30 | 無限 |
| 群組數 / 帳戶數 | 無限 | 無限 |

`lib/quota.ts`:
- 有 BYOK → 用 user 預設 provider，不計
- 平台 key 計入 `ai_usage`，月初歸零
- recognize op + Ollama 預設且模型無 vision → 自動降到其他 vision-capable provider 或平台 Gemini

## 環境變數 (`.env`)

```bash
# Ports
WEB_PORT=28100
SERVER_PORT=18101

# DB
POSTGRES_USER=laiki
POSTGRES_PASSWORD=...
POSTGRES_DB=laiki
DATABASE_URL=postgres://laiki:...@db:5432/laiki

# LINE Messaging Bot
LINE_CHANNEL_ID=...
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_BOT_BASIC_ID=@280onoms

# LINE Login (LIFF host)
LINE_LOGIN_CHANNEL_ID=...
LIFF_ID=2010125731-4UWhwDmk

# 平台預設 Gemini (BYOK 沒設時用)
GEMINI_API_KEY=...
GEMINI_PARSE_MODEL=gemini-2.5-flash-lite
GEMINI_VISION_MODEL=gemini-2.5-flash

# BYOK 加密 key (32 bytes base64)
APIKEY_ENC_KEY=...

# Public URLs
PUBLIC_BASE=https://app.heyinna.com/laiki
LIFF_BASE=https://liff.line.me/2010125731-4UWhwDmk
ALLOWED_ORIGINS=https://liff.line.me,https://app.heyinna.com
```

## 部署

### 首次

1. LINE Developers Console 兩個 channel (同 Provider):
   - **Messaging API**: Webhook URL `https://app.heyinna.com/laiki/webhook/line`、停用自動回覆與歡迎、開啟「允許機器人加入群組與多人聊天室」
   - **LINE Login**: LIFF Endpoint URL `https://app.heyinna.com/laiki/`

2. Caddy 路由 (caddy-manager/routes/heyinna.yaml 已含 `/laiki/*`):
   ```bash
   cd /home/neo/caddy-manager && make apply
   ```

3. `.env` 填值

4. 起容器:
   ```bash
   docker compose up -d --build
   docker compose exec server npm run db:migrate:prod
   ```

5. 驗證: `curl https://app.heyinna.com/laiki/api/health` → `{"ok":true}`

6. Rich Menu (選用):
   ```bash
   docker compose exec server npm run line:richmenu:setup
   ```

### 日常更新

```bash
git pull
docker compose up -d --build
docker compose exec server npm run db:migrate:prod
```

### Dev (不走 Docker)

```bash
docker compose up -d db
cd server && cp .env.example .env && npm install && npm run db:migrate && npm run dev
ngrok http 3001   # 暴露 webhook
cd liff-app && cp .env.example .env && npm install && npm run dev
```

## 安全

- **LINE webhook 簽章**: HMAC-SHA256 + `timingSafeEqual`
- **LIFF session**: idToken → LINE OAuth verify → httpOnly + Secure + SameSite=None cookie
- **BYOK 加密**: AES-256-GCM，IV per key，不 log 明文
- **CORS**: 白名單 `liff.line.me` + LIFF_BASE
- **帳戶餘額**: SQL `balance = balance + delta` atomic
- **群組訊息**: in-memory 處理，不長期存原文
- **共享帳戶**: `canAccessAccount` 統一檢查 (own 或 account_members)

## 測試

🚧 待補 (見 TODO.md Priority 1):
- lib/settle min-transfer
- lib/balances computeBalances
- lib/accountDelta 一致性
- lib/quota / lib/crypto
- webhook signature
- ai/parseTransaction zod 邊界

## 里程碑

- **M0–M12** ✅ 全完成 (見 TODO.md)
- **Next**: 測試覆蓋 / LLM fallback chain / 預算 / Rate limit / 圖表進化

## 相關連結

- LINE Developers: https://developers.line.biz
- LIFF v2 docs: https://developers.line.biz/en/reference/liff/
- Gemini API: https://ai.google.dev/gemini-api/docs
- OpenAI API: https://platform.openai.com/docs/api-reference
- Anthropic API: https://docs.anthropic.com
- Ollama: https://github.com/ollama/ollama

---

*基礎沿用自 `group_expense_tracker` (Hono + Drizzle + PostgreSQL)，加上 LINE/LIFF/多 LLM/多帳戶/共享帳戶/共同基金/分帳/推播*
