export function fmtDate(s: string): string {
  try {
    return new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric" }).format(new Date(s));
  } catch {
    return s;
  }
}

export function fmtMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `NT$${v.toLocaleString("zh-TW")}`;
}

export function groupTypeLabel(type: string | undefined | null): string {
  switch (type) {
    case "fund":
      return "共同基金";
    case "split":
      return "群組分帳";
    case "shared":
      return "共享";
    default:
      return type ?? "";
  }
}
