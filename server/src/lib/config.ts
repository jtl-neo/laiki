export const LIFF_BASE = process.env.LIFF_BASE ?? "https://liff.line.me";
export const BOT_BASIC_ID = process.env.LINE_BOT_BASIC_ID ?? "";
export const INVITE_URL = BOT_BASIC_ID
  ? `https://line.me/R/ti/p/${encodeURIComponent(BOT_BASIC_ID)}`
  : "https://line.me/R/nv/recommendOA";
export const FREE_PARSE_QUOTA = Number(process.env.FREE_PARSE_QUOTA ?? 50);
export const FREE_RECOGNIZE_QUOTA = Number(process.env.FREE_RECOGNIZE_QUOTA ?? 30);
export const JOB_TZ = process.env.JOB_TZ ?? "Asia/Taipei";
export const PLATFORM_OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
export const PLATFORM_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const PLATFORM_GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
