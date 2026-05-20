import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const ACCEPT_KEY = "laiki.tos.accepted";

export default function Onboarding() {
  const nav = useNavigate();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(ACCEPT_KEY)) {
      nav("/dashboard", { replace: true });
    }
  }, [nav]);

  const onStart = () => {
    if (!accepted) return;
    localStorage.setItem(ACCEPT_KEY, new Date().toISOString());
    nav("/dashboard");
  };

  return (
    <div className="p-6 space-y-6 pb-24">
      <h1 className="text-2xl font-bold">歡迎使用來記 Laiki</h1>
      <p className="text-neutral-600">
        直接傳訊息給 Laiki Bot，例如「早餐 65 LINE Pay」，AI 會自動記帳。
      </p>

      <section className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-2">
        <h2 className="font-bold text-amber-900">⚠ 開始前請務必了解</h2>
        <p className="text-sm text-amber-900">
          Laiki 透過 LINE Messaging API 運作，<b>所有傳給 Bot 的訊息都會送到伺服器處理，並可從後台查看</b>。請勿傳送密碼、信用卡號等高敏感資料。
        </p>
        <Link
          to="/terms"
          className="inline-block text-sm text-amber-900 underline font-medium"
        >
          查看完整使用條款與隱私政策 →
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">三步上手</h2>
        <ol className="list-decimal list-inside text-sm text-neutral-700 space-y-1">
          <li>傳訊息給 Bot：「早餐 65」、「7-11 飲料 35」</li>
          <li>群組分帳：把 Bot 加入群組，標記 @laiki</li>
          <li>查看記錄：點開 LIFF 看儀表板、總覽、報告</li>
        </ol>
        <Link to="/help" className="inline-block text-sm text-emerald-700 underline">
          詳細使用教學 →
        </Link>
      </section>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm text-neutral-700">
          我已閱讀並同意
          <Link to="/terms" className="text-emerald-700 underline mx-1">
            使用條款與隱私政策
          </Link>
          ，了解傳給 Bot 的訊息可被後台檢視。
        </span>
      </label>

      <button
        onClick={onStart}
        disabled={!accepted}
        className="block w-full px-4 py-3 bg-emerald-600 text-white rounded font-medium disabled:opacity-40"
      >
        開始使用 →
      </button>
    </div>
  );
}
