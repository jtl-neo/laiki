# 測試計畫 — LLM 架構優化（1對1 + 影子帳號）

對應 roadmap：統一 discriminated schema、context 注入、LLM 分帳數學、影子帳號/debts/PIN、跨帳號 push。
原則：**測試先行**。每個 Phase 有「通過閘門」— 該層測試全綠才進下一 Phase。

```
L1 純函式單測（無 DB、無 mock）        — 快，Phase 0/1 閘門
L2 DB 整合測試（testcontainers）       — Phase 2 閘門
L3 模擬測試（webhook replay + fakes）  — Phase 3/4 閘門
L4 LLM Eval（真模型、env-gated）       — prompt 品質，不擋 CI
```

執行：
```bash
npm test                          # L1+L2+L3（L2/L3 需 Docker，無則自動 skip）
npx vitest run src/               # 只 L1
npx vitest run test/sim/          # 只 L3
LAIKI_EVAL=1 npx vitest run test/eval/   # L4，手動跑
```

---

## L1 純函式單測（`src/**/*.test.ts`）

### T-100 `src/ai/unifiedSchema.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-101 | 合法 expense parse | UnifiedParseSchema.parse 通過，預設值補齊（missing_fields=[], confidence=0.8） |
| T-102 | 合法 split_expense（含 debts、my_share） | data.debts 結構正確 |
| T-103 | 合法 fund_expense（含 fund_name） | 通過 |
| T-104 | type 非法值 | throw ZodError |
| T-105 | 字串 "null"/"" 在 nullable 欄位 | preprocess → null |
| T-106 | confidence 超界（1.5 / -0.1） | throw |
| T-107 | debts 內 amount 非數字 | throw |
| T-108 | tx_date 非 YYYY-MM-DD | 轉 null（沿用現有 txDateStr 行為） |

### T-110 `deriveMissingFields`（同檔或獨立）
後端不全信 LLM 的 missing_fields，自己再算一次，取交集驅動追問。
| ID | 案例 | 期望 missing |
|---|---|---|
| T-111 | expense，total_amount=null | ["total_amount"] |
| T-112 | expense，payment_method=null | ["payment_method"] |
| T-113 | split_expense，debts=[] | ["debt_distribution"] |
| T-114 | split_expense，全齊 | [] |
| T-115 | fund_expense，fund_name=null | ["fund_name"] |
| T-116 | fund_expense 不要求 payment_method | 不含 "payment_method" |
| T-117 | LLM 回 is_complete=true 但 total_amount=null | 後端覆寫 → 仍追問 total_amount |
| T-118 | LLM 回 is_complete=false 但欄位其實全齊 | 後端覆寫 → 不追問，直接 confirm |

### T-120 分帳數學驗證 `validateSplitMath`
LLM 算的數學要後端複核：`my_share + Σdebts == total_amount`（容差 ±0.01）。
| ID | 案例 | 期望 |
|---|---|---|
| T-121 | 500 = 120 + 180 + 200 | valid |
| T-122 | my_share=null 但 total 與 debts 齊 | 自動補 my_share = total − Σdebts |
| T-123 | 總和不符（500 ≠ 100+180+200） | invalid → 標 missing "debt_distribution" 觸發追問 |
| T-124 | my_share 補出來是負數 | invalid |
| T-125 | 浮點容差（0.01 內） | valid |
| T-126 | debts 有重複 name | 合併或 invalid（實作時定案，測試鎖行為） |

### T-130 `parseSimpleText` 回歸（既有 `parseTransaction.test.ts` 遷移）
| ID | 案例 | 期望 |
|---|---|---|
| T-131 | 既有所有 case 不變 | 全綠（快速路徑不退化） |
| T-132 | simple 結果 → `toUnified()` 對映 | type=expense、data.total_amount/category/note 正確 |
| T-133 | 含「和」「跟」多人語句 | simple 放棄（回 null）→ 走 LLM（split 不能走規則式） |

### T-140 `renderContextPrompt`
| ID | 案例 | 期望 |
|---|---|---|
| T-141 | 有別名/付款方式/基金名 | prompt 含全部字串、格式穩定 |
| T-142 | 全空 | 回空字串或「無已知好友」段，不噴 undefined |
| T-143 | 別名含 prompt-injection 字元（換行、「忽略以上指示」） | 跳脫/截斷，prompt 結構不被破壞 |

### T-150 PIN 碼純邏輯
| ID | 案例 | 期望 |
|---|---|---|
| T-151 | 產碼格式 | 6 位數字、不以 0 開頭可（鎖定一種，測試固定） |
| T-152 | 過期判斷 | expiresAt < now → invalid |
| T-153 | 已用判斷 | usedAt 非 null → invalid |

---

## L2 DB 整合測試（`test/`，testcontainers）

前置：`test/helpers.ts` 擴充 —
- `TABLES` 加 `debts`, `payment_methods`, `binding_codes`
- 新 helper：`seedShadow(creatorId, name)`、`seedPaymentMethod(userId, name, type)`、`seedFundGroup(ownerId, balance, memberIds)`

### T-200 migration 驗證（global-setup 跑 migrate 後）
| ID | 案例 | 斷言 |
|---|---|---|
| T-201 | schema 欄位存在 | users.is_virtual / users.created_by / line_user_id nullable |
| T-202 | 影子帳號可插入 | lineUserId=null 兩筆都成功（partial unique 不擋 null） |
| T-203 | 真帳號 line_user_id 重複 | 違反 unique → throw |

### T-210 `test/shadowAccount.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-211 | resolveOrCreateShadow 新別名 | 建 user：is_virtual=true、created_by=creator、display_name=別名 |
| T-212 | 同 creator 同別名呼叫兩次 | 回同一 userId（不重複建） |
| T-213 | 不同 creator 同別名 "a" | 各自獨立 user（別名 scope = creator） |
| T-214 | 別名命中已綁定好友 | 回實體 user，不建影子 |
| T-215 | generateBindingCode | binding_codes 一筆、6 位、expiresAt 未來 |
| T-216 | claimBindingCode 成功 | user.line_user_id 填入、is_virtual=false、code.usedAt 設定 |
| T-217 | claim 後 debts 不變 | debts.debtor_id 仍指同 userId（merge 不搬資料，UUID 不變） |
| T-218 | 過期 / 已用 / 不存在 code | 各回明確錯誤 |
| T-219 | 認領者已是系統實體 user（先 follow 過 bot） | 定義 merge 策略：影子併入實體（debts 改指實體、刪影子）— 測試鎖行為 |

### T-220 `test/debts.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-221 | commitPending(split) | debts N 筆、creditor=payer、status=PENDING、金額對 |
| T-222 | 同時寫 transactionSplits（雙寫過渡） | splits 與 debts 金額一致 |
| T-223 | settle 某筆 | status=SETTLED、settlements 記錄存在 |
| T-224 | 查使用者未結債權/債務 | 聚合金額正確（影子+實體混合） |
| T-225 | commit 失敗 rollback | debts/transactions/balance 無半寫（db.transaction 原子性） |

### T-230 `test/paymentMethods.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-231 | CRUD | 建/列/改/刪 |
| T-232 | LLM 字串 → id 解析（「富邦卡」精確命中） | 回 id |
| T-233 | 模糊命中（「富邦」vs「富邦卡」） | 部分匹配規則固定，測試鎖行為 |
| T-234 | 無命中 | 回 null → 上層追問 |

### T-240 `test/buildContext.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-241 | 有影子好友/付款方式/基金 | loadParseContext 三清單正確 |
| T-242 | 全新使用者 | 三空陣列，不 throw |
| T-243 | 已綁定好友也列入 aliases | 含 is_virtual=false 的 display_name |

---

## L3 模擬測試（`test/sim/`）

### 測試替身（先建，全部情境共用）
| 檔案 | 內容 |
|---|---|
| `test/sim/fakeProvider.ts` | 實作 `AIProvider`；`enqueue(response)` 排回應佇列；記錄收到的 systemPrompt/userText 供斷言（驗 context 注入）；佇列空 → throw（抓多打 LLM 的 bug） |
| `test/sim/fakeLine.ts` | mock `line/client.ts` 的 `lineClient()`（vi.mock）；攔 `replyMessage`/`pushMessage` 進 `replies[]`/`pushes[]`；helper：`lastReply()`, `quickReplyLabels()`, `pushTargets()` |
| `test/sim/events.ts` | `textEvent(lineUserId, text)` / `postbackEvent(lineUserId, data)` / `followEvent(lineUserId)` — 造 LINE WebhookEvent 物件 |
| `test/sim/harness.ts` | `sim()` 回 `{ send(event), replies, pushes }`；內部呼叫 webhook `dispatch()`；`beforeEach(cleanDb + fake reset)` |

注入方式：`vi.mock("../../src/line/client.js")` + provider 用 DI（`parseUnified(provider, …)` 已收 provider 參數；handlers 取 provider 處加測試 override，env `LAIKI_FAKE_AI=1` 時用 fakeProvider singleton）。

### T-300 `scenario-split.test.ts` — 範例一（麥當勞 500）
| ID | 步驟 | 斷言 |
|---|---|---|
| T-301 | enqueue split parse（missing payment_method）→ text「和a和b吃麥當勞我先出 a180 b200 共500」 | 回 Quick Reply 問付款方式；選項 = 該 user payment_methods；pending_entries 1 筆 |
| T-302 | postback 選富邦卡 | users +2 筆 is_virtual=true（a,b）；debts 2 筆 PENDING 180/200；tx 一筆 500；富邦對應帳務正確；回分帳成功卡（altText 含「分帳」） |
| T-303 | 同句但 a 已是綁定好友 | 只建 b 影子；a 的 debt 指實體 a |
| T-304 | LLM 數學錯（Σ≠total） | 不直接 commit；追問金額分配 |
| T-305 | 中途 cancel postback | pending 刪除、無 tx、無 debts、無影子殘留 |

### T-310 `scenario-claim.test.ts` — 範例二（PIN 認領）
| ID | 步驟 | 斷言 |
|---|---|---|
| T-311 | 建影子 a + debt 180 → 產 PIN → followEvent(真a) + textEvent(PIN) | a：is_virtual=false、line_user_id 填入；回「認領成功」歷史帳單卡，含 $180 |
| T-312 | 錯誤 PIN | 回錯誤訊息；不影響任何 user |
| T-313 | 過期 PIN | 回過期訊息 |
| T-314 | 自己輸入自己產的 PIN | 拒絕（不能認領自己建的影子） |
| T-315 | 認領後創建者收 push 通知 | pushes 含 creator lineUserId |
| T-316 | PIN 純數字輸入不誤觸記帳 | 6 位數字先查 binding_codes，無命中才進 parse 流程 |

### T-320 `scenario-fund.test.ts` — 範例三（共同基金 450）
| ID | 步驟 | 斷言 |
|---|---|---|
| T-321 | 三人綁 fund（餘額 5000）→ enqueue fund parse → text「用共同基金買衛生紙450」 | fund 帳戶 4550；tx kind=fund_out；pushes = 3 個已綁定 lineUserId；卡片含餘額 4550 |
| T-322 | 成員含影子帳號 | 影子不收 push（無 line_user_id）；實體都收 |
| T-323 | 餘額不足（fund=100, 花 450） | 行為鎖定：警告但記帳 or 拒絕（實作定案，測試鎖住） |
| T-324 | fund_name 無命中任何基金 | 追問或建議清單（Quick Reply 列基金名） |

### T-330 `missing-fields.test.ts` — 追問矩陣
| ID | LLM 回 missing | 斷言追問 |
|---|---|---|
| T-331 | ["total_amount"] | 回金額追問（Quick Reply 數字猜測） |
| T-332 | ["payment_method"] | 回付款方式選單 |
| T-333 | ["debt_distribution"] | 回分配追問 |
| T-334 | 多缺漏 ["total_amount","payment_method"] | 依固定順序逐一問（金額先）；補完一個問下一個 |
| T-335 | 全齊 is_complete=true | 直接 confirm 卡 |
| T-336 | 追問中使用者直接打數字 | 補進 draft、進下一步（沿用 tryAnswerAmount 行為） |
| T-337 | 追問中 30 分逾時後再點 postback | 回「已逾時」 |
| T-338 | 追問中丟新記帳句 | 新 pending 取代舊（upsertPending 既有行為不退化） |

### T-340 `context-injection.test.ts`
| ID | 案例 | 斷言 |
|---|---|---|
| T-341 | user 有別名 a/付款方式富邦卡/基金「家裡用的東西」 | fakeProvider 收到的 systemPrompt 含三者 |
| T-342 | 新 user | prompt 無 context 段或標示空，不含 "undefined" |

### T-350 `unified-pipeline.test.ts` — parse/recognize 合併
| ID | 案例 | 斷言 |
|---|---|---|
| T-351 | imageEvent（收據） | 走同一 unified schema；fakeProvider 收到 images |
| T-352 | LLM 回非法 JSON 第一次、合法第二次 | 重試成功，使用者無感 |
| T-353 | 兩次都失敗 | 回友善錯誤訊息，ai_records 記 errorMessage |
| T-354 | ai_records 寫入 + commit 後 transactionId 回填 | 既有 27cd5ef 行為不退化 |

### T-360 回歸保護
| ID | 案例 | 斷言 |
|---|---|---|
| T-361 | 既有 `test/api/*.test.ts` 全綠 | LIFF/API 路徑不被 schema 改動弄壞 |
| T-362 | 個人記帳 DM 流程（無分帳） | expense 流程照舊：金額→帳戶→分類→confirm |
| T-363 | balances/settle 既有單測 | `src/lib/balances.test.ts`、`settle.test.ts` 不退化 |

---

## L4 LLM Eval（`test/eval/`，env-gated，不進 CI）

真 provider 打真模型，量 prompt 品質。`LAIKI_EVAL=1` 才跑。

- [ ] T-401 golden dataset `test/eval/golden.jsonl`：~30 句台灣口語記帳 → 期望 `{type, total_amount, debts, fund_name}`（容許 category/note 浮動）
  - 10 句單純支出（含口語黏字「吃午餐200」）
  - 10 句分帳（含「我先出」「a 180 b 200」「平分」變體）
  - 5 句基金（「用共同基金…」「公費」）
  - 5 句干擾（收入/轉帳/無金額閒聊 → 不誤判 split）
- [ ] T-402 eval runner：逐句打 `parseUnified`，比對欄位，輸出準確率報表（type 準確率、金額準確率、debts 全對率）
- [ ] T-403 門檻：type ≥ 95%、amount ≥ 95%、debts 全對 ≥ 85%（低於 → 調 prompt，不改 code）

---

## 實作順序（測試先行）

```
1. L1 全寫（紅）→ Phase 0/1 實作 → L1 綠          ← 閘門 1
2. helpers 擴充 + L2 全寫（紅）→ Phase 2 migration + lib → L2 綠   ← 閘門 2
3. 測試替身（fakeProvider/fakeLine/events/harness）
4. L3 T-330/340/350 寫 → Phase 3 實作 → 綠
5. L3 T-300/310/320 寫 → Phase 4 實作 → 綠 + T-360 回歸全綠        ← 閘門 3
6. L4 golden dataset + runner → prompt 調優
```

備註：
- 行為未定案的測試（T-126、T-219、T-233、T-323）：實作時定案行為，**測試鎖住決定**，roadmap 註記。
- 無 Docker 環境：L2/L3 沿用 `LAIKI_SKIP_INTEGRATION=1` 自動 skip（`test/setup.ts` 既有機制）。
