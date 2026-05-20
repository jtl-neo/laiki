export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDaysUTC(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function clampDayOfMonth(year: number, monthIdx0: number, day: number): number {
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  return Math.min(day, last);
}

export function computeNextRunDate(
  current: Date,
  frequency: Frequency,
  anchorDay: number | null,
): Date {
  if (frequency === "daily") return addDaysUTC(current, 1);
  if (frequency === "weekly") {
    if (anchorDay == null) return addDaysUTC(current, 7);
    const cur = current.getUTCDay();
    const target = ((anchorDay % 7) + 7) % 7;
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7;
    return addDaysUTC(current, delta);
  }
  if (frequency === "monthly") {
    const y = current.getUTCFullYear();
    const m = current.getUTCMonth();
    const day = anchorDay ?? current.getUTCDate();
    const nm = m + 1;
    const ny = nm > 11 ? y + 1 : y;
    const mIdx = nm % 12;
    const d = clampDayOfMonth(ny, mIdx, day);
    return new Date(Date.UTC(ny, mIdx, d));
  }
  // yearly
  const y = current.getUTCFullYear();
  const m = current.getUTCMonth();
  const day = anchorDay ?? current.getUTCDate();
  const d = clampDayOfMonth(y + 1, m, day);
  return new Date(Date.UTC(y + 1, m, d));
}
