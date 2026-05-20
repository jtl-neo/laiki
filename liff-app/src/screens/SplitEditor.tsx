import { useState } from "react";

interface Member {
  userId: string;
  displayName: string;
}

interface Split {
  userId: string;
  amount: number;
}

interface Props {
  members: Member[];
  total: number;
  value: Split[];
  onChange: (next: Split[]) => void;
  method?: "equal" | "custom";
}

export default function SplitEditor({
  members,
  total,
  value,
  onChange,
  method: initialMethod,
}: Props) {
  const [method, setMethod] = useState<"equal" | "custom">(
    initialMethod ?? "equal",
  );

  function distributeEqual(): Split[] {
    if (members.length === 0) return [];
    const each = Math.floor((total * 100) / members.length) / 100;
    const next = members.map((m) => ({ userId: m.userId, amount: each }));
    const sum = next.reduce((s, r) => s + r.amount, 0);
    const remainder = Math.round((total - sum) * 100) / 100;
    if (next.length > 0) {
      const last = next[next.length - 1]!;
      last.amount = Math.round((last.amount + remainder) * 100) / 100;
    }
    return next;
  }

  function setMode(next: "equal" | "custom") {
    setMethod(next);
    if (next === "equal") onChange(distributeEqual());
  }

  function updateAmount(userId: string, amount: number) {
    const next = members.map((m) => {
      const existing = value.find((v) => v.userId === m.userId);
      if (m.userId === userId) {
        return { userId, amount: isNaN(amount) ? 0 : amount };
      }
      return existing ?? { userId: m.userId, amount: 0 };
    });
    onChange(next);
  }

  const rows = members.map(
    (m) =>
      value.find((v) => v.userId === m.userId) ?? {
        userId: m.userId,
        amount: 0,
      },
  );
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const diff = Math.round((total - sum) * 100) / 100;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("equal")}
          className={`flex-1 px-3 py-2 rounded text-sm ${
            method === "equal"
              ? "bg-emerald-600 text-white"
              : "bg-white border text-neutral-700"
          }`}
        >
          平分
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`flex-1 px-3 py-2 rounded text-sm ${
            method === "custom"
              ? "bg-emerald-600 text-white"
              : "bg-white border text-neutral-700"
          }`}
        >
          自訂
        </button>
      </div>

      <ul className="space-y-2">
        {members.map((m) => {
          const row = rows.find((r) => r.userId === m.userId)!;
          return (
            <li
              key={m.userId}
              className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm gap-3"
            >
              <span className="font-medium">{m.displayName}</span>
              <input
                type="number"
                value={row.amount}
                disabled={method === "equal"}
                onChange={(e) => updateAmount(m.userId, Number(e.target.value))}
                className="w-28 p-2 border rounded text-right font-mono disabled:bg-neutral-100"
              />
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between text-sm text-neutral-500">
        <span>合計 NT${sum.toLocaleString("zh-TW")}</span>
        <span className={diff === 0 ? "text-emerald-600" : "text-amber-600"}>
          差額 NT${diff.toLocaleString("zh-TW")}
        </span>
      </div>
    </div>
  );
}
