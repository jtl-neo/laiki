import { Link, useLocation } from "react-router-dom";

const tabs = [
  { label: "首頁", icon: "🏠", to: "/dashboard" },
  { label: "群組", icon: "📚", to: "/groups" },
  { label: "好友", icon: "👥", to: "/friends" },
  { label: "帳戶", icon: "💳", to: "/accounts" },
  { label: "總覽", icon: "📊", to: "/overview" },
  { label: "設定", icon: "⚙", to: "/settings" },
];

export default function TabBar() {
  const location = useLocation();
  if (location.pathname === "/onboarding") return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-neutral-200 z-40 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((t) => {
        const active = location.pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex-1 flex flex-col items-center pt-2 pb-1.5 text-[11px] gap-0.5 ${
              active ? "text-emerald-600" : "text-neutral-500"
            }`}
          >
            <span
              className={`text-lg leading-none transition-transform ${
                active ? "scale-110" : ""
              }`}
            >
              {t.icon}
            </span>
            <span className={active ? "font-semibold" : ""}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
