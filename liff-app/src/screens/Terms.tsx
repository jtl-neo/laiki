import Header from "../components/Header";

export default function Terms() {
  return (
    <div className="pb-24">
      <Header title="使用條款與隱私" back="/settings" />
      <div className="p-4 space-y-6 text-sm leading-relaxed">
        <section className="bg-red-50 border-2 border-red-300 rounded-lg p-4 space-y-2">
          <h2 className="font-bold text-base text-red-800">
            ⚠ 重要隱私須知 — LINE Bot 聊天可見性
          </h2>
          <p className="text-red-800">
            Laiki 是基於 LINE Messaging API 建置的 Bot。
            <b>所有你傳給 Bot 的訊息（含 1-on-1 私訊、群組訊息、圖片）都會送到我們的伺服器處理，並可從後台管理介面查看。</b>
          </p>
          <ul className="list-disc list-inside text-red-800 space-y-1">
            <li>
              請<b>不要</b>在訊息中包含密碼、信用卡完整號碼、身分證號等高敏感資料
            </li>
            <li>群組訊息中只要 @laiki 標記後的內容也會送上後台</li>
            <li>傳給 Bot 的圖片會暫存於伺服器以進行 OCR</li>
            <li>
              若 Bot 加入群組，<b>所有成員的訊息</b>在 @ 標記時都會被送出處理
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">1. 資料蒐集</h2>
          <p>使用本服務時會蒐集以下資料：</p>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>LINE User ID、顯示名稱、頭像（建立帳號用）</li>
            <li>你傳給 Bot 的訊息文字、圖片、貼圖事件</li>
            <li>你在 LIFF 中建立的帳戶、交易、預算、群組</li>
            <li>AI 用量統計（呼叫次數，不含原始內容）</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">2. 資料使用</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>提供記帳、分帳、AI 解析等核心功能</li>
            <li>透過第三方 LLM 解析訊息內容</li>
            <li>產生個人化報告、分類建議</li>
          </ul>
          <p className="text-neutral-700">
            訊息內容會送往平台預設 LLM 供應商進行解析。
          </p>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">3. 資料儲存與安全</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>所有資料儲存於台灣或東亞區域的雲端資料庫</li>
            <li>傳輸全程使用 HTTPS</li>
            <li>後台管理人員為個人開發者，僅在除錯或客服需求下查閱</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">4. 第三方服務</h2>
          <p>本服務使用以下第三方：</p>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>LINE Corporation（訊息傳輸、登入認證）</li>
            <li>LLM 供應商（內容解析）</li>
          </ul>
          <p className="text-neutral-700">
            上述第三方有各自的隱私政策，請另行參閱。
          </p>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">5. 你的權利</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>透過「設定 → 匯入 / 匯出」匯出完整個人資料</li>
            <li>透過 LINE 封鎖 Bot 即停止後續訊息蒐集</li>
            <li>要求刪除帳號與資料：聯絡開發者</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">6. 服務免責</h2>
          <ul className="list-disc list-inside text-neutral-700 space-y-1">
            <li>本服務以「現況」提供，不保證 AI 解析正確率</li>
            <li>請使用者自行核對交易紀錄</li>
            <li>不對資料遺失、服務中斷負責</li>
            <li>定期匯出備份是你的責任</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-2">
          <h2 className="font-bold text-base">7. 條款變更</h2>
          <p className="text-neutral-700">
            本條款可能隨服務調整更新。重大變更會透過 LINE Bot 推播通知。
          </p>
        </section>

        <p className="text-xs text-neutral-500 text-center pt-4">
          最後更新：2026-05-19
        </p>
      </div>
    </div>
  );
}
