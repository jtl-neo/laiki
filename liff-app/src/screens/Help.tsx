import { Link } from "react-router-dom";
import Header from "../components/Header";

export default function Help() {
  return (
    <div className="pb-24">
      <Header title="使用教學" back="/settings" />
      <div className="p-4 space-y-6 text-sm leading-relaxed">
        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">個人記帳</h2>
          <p>1-on-1 直接傳訊息給 Laiki Bot，AI 自動解析。</p>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>「早餐 65 LINE Pay」 → 自動分類飲食、帳戶 LINE Pay</li>
            <li>「7-11 飲料 35」 → 飲食 / 預設帳戶</li>
            <li>傳收據照片 → OCR 自動辨識金額和品項</li>
            <li>回覆「修改分類」/「修改金額」可校正</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">群組分帳 / 共同基金</h2>
          <p>將 Bot 加入 LINE 群組後，選擇模式：</p>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>
              <b>群組分帳</b>：每筆紀錄 AA 制，可結算最少轉帳
            </li>
            <li>
              <b>共同基金</b>：所有支出從共用池子，記錄入金/出金
            </li>
          </ul>
          <p className="text-xs text-neutral-500">
            群組內須 <b>@laiki</b> 標記才會觸發 AI（避免吵）。
          </p>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">帳戶 / 轉帳</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>新增多種類型：現金、簽帳、信用卡、銀行、電子錢包</li>
            <li>支援帳戶間轉帳，雙邊餘額自動同步</li>
            <li>可分享帳戶給他人（如夫妻共用信用卡）</li>
            <li>調整餘額會留下「餘額調整」交易紀錄可追溯</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">BYOK（自帶 AI 金鑰）</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>支援 Gemini / OpenAI / Anthropic / Ollama</li>
            <li>綁定後不計平台配額，無使用上限</li>
            <li>金鑰加密儲存，可隨時刪除</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">匯入 / 匯出</h2>
          <p>
            在「設定 → 匯入 / 匯出」可下載 JSON 完整資料、或從備份還原到新帳號。
          </p>
        </section>

        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <h2 className="font-bold text-base text-amber-800">隱私提醒</h2>
          <p className="text-amber-800">
            使用 Laiki Bot 前請務必閱讀
            <Link to="/terms" className="underline font-medium">
              使用條款
            </Link>
            ，了解資料蒐集與 LINE 平台限制。
          </p>
        </section>
      </div>
    </div>
  );
}
