export function minTransfers(
  balances: { userId: string; net: number }[],
): { from: string; to: string; amount: number }[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const EPS = 0.005;

  const creditors: { userId: string; net: number }[] = [];
  const debtors: { userId: string; net: number }[] = [];

  for (const b of balances) {
    const n = round2(b.net);
    if (n > EPS) creditors.push({ userId: b.userId, net: n });
    else if (n < -EPS) debtors.push({ userId: b.userId, net: n });
  }

  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => a.net - b.net);

  const transfers: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i]!;
    const d = debtors[j]!;
    const amount = round2(Math.min(c.net, -d.net));

    if (amount > EPS) {
      transfers.push({ from: d.userId, to: c.userId, amount });
    }

    c.net = round2(c.net - amount);
    d.net = round2(d.net + amount);

    if (c.net <= EPS) i++;
    if (d.net >= -EPS) j++;
  }

  return transfers;
}
