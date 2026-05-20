type Lang = "zh-TW" | "en";

const dict = {
  "zh-TW": {
    onboarding_title: "歡迎使用來記！",
    onboarding_body: "我是你的記帳小幫手。\n直接傳訊息給我，例如：\n「早餐 65 LINE Pay」",
    tx_confirmed: "✓ 已記錄",
    tx_cancelled: "已取消",
    quota_exceeded: "本月 AI 額度用完。可在 LIFF 設定貼自己的 Gemini API key（無限）。",
    parse_failed: "看不懂這句 😢 試試「早餐 65 現金」格式，或在 LIFF 手動輸入",
    no_account: "找不到帳戶。請先在 LIFF 建立至少一個帳戶。",
    edit: "編輯",
    cancel: "取消",
    change_account: "改帳戶",
  },
  en: {
    onboarding_title: "Welcome to Laiki!",
    onboarding_body: "Just message me, e.g. \"breakfast 65 cash\"",
    tx_confirmed: "✓ Saved",
    tx_cancelled: "Cancelled",
    quota_exceeded: "Monthly AI quota reached. Add your own Gemini key in LIFF for unlimited use.",
    parse_failed: "Could not parse. Try \"breakfast 65 cash\" or use LIFF.",
    no_account: "No account found. Create one in LIFF first.",
    edit: "Edit",
    cancel: "Cancel",
    change_account: "Change account",
  },
} as const;

export function t(key: keyof (typeof dict)["zh-TW"], lang: Lang = "zh-TW"): string {
  return dict[lang]?.[key] ?? dict["zh-TW"][key];
}
