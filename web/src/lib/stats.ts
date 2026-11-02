import type { Entry, Kind, Reminder } from "./api";

export type Period = "all" | "12m" | "year" | `${number}`;

export function inPeriod(entries: Entry[], period: Period, todayIso: string): Entry[] {
  if (period === "all") return entries;
  if (period === "year") return entries.filter((e) => e.date.startsWith(todayIso.slice(0, 4)));
  if (period === "12m") {
    const d = new Date(`${todayIso}T12:00:00`);
    d.setFullYear(d.getFullYear() - 1);
    const from = d.toISOString().slice(0, 10);
    return entries.filter((e) => e.date > from && e.date <= todayIso);
  }
  return entries.filter((e) => e.date.startsWith(period));
}

export type KindTotals = Record<Kind, number>;
const zero = (): KindTotals => ({ service: 0, upgrade: 0, expense: 0, fuel: 0 });

export function summarize(entries: Entry[]) {
  const byKind = zero();
  const byCategory = new Map<string, { kind: Kind; category: string | null; total: number; count: number }>();
  const byMonth = new Map<string, KindTotals>();
  let partsTotal = 0;
  let laborTotal = 0;

  for (const e of entries) {
    byKind[e.kind] += e.total;
    const key = `${e.kind}:${e.category ?? ""}`;
    const cat = byCategory.get(key) ?? { kind: e.kind, category: e.category, total: 0, count: 0 };
    cat.total += e.total;
    cat.count += 1;
    byCategory.set(key, cat);
    const ym = e.date.slice(0, 7);
    const m = byMonth.get(ym) ?? zero();
    m[e.kind] += e.total;
    byMonth.set(ym, m);
    if (e.items.length) {
      partsTotal += e.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
      laborTotal += e.labor ?? 0;
    }
  }

  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  const odos = entries.map((e) => e.odometer).filter((o): o is number => o != null);
  const distance = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;

  return {
    total,
    byKind,
    byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total),
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)),
    partsTotal,
    laborTotal,
    distance,
    costPerKm: distance > 0 ? total / distance : null,
    count: entries.length,
  };
}

/** Fills every month between the first and last key so gaps render as empty bars. */
export function fillMonths(months: [string, KindTotals][]): [string, KindTotals][] {
  if (!months.length) return [];
  const map = new Map(months);
  const out: [string, KindTotals][] = [];
  let [y, m] = months[0][0].split("-").map(Number);
  const last = months[months.length - 1][0];
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push([ym, map.get(ym) ?? zero()]);
    if (ym >= last) break;
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Fuel economy using the full-tank method: between two full fills, the distance driven
 * divided by all liters added after the first one (including partial fills and fills
 * logged without an odometer). Physically impossible segments (bad odometer typos) are ignored.
 */
export function fuelEconomy(entries: Entry[]) {
  const fills = entries
    .filter((e) => e.kind === "fuel")
    .sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? 0) - (b.odometer ?? 0));
  const perEntry = new Map<string, number>(); // entry id -> km/L
  let dist = 0;
  let liters = 0;
  let lastFull: Entry | null = null;
  let pending = 0;
  for (const f of fills) {
    pending += f.fuel_liters ?? 0;
    if (f.odometer == null || !f.full_tank) continue;
    if (lastFull && pending > 0) {
      const d = f.odometer - lastFull.odometer!;
      const kmPerL = d / pending;
      if (d > 0 && kmPerL < MAX_KM_PER_L) {
        perEntry.set(f.id, kmPerL);
        dist += d;
        liters += pending;
      }
    }
    lastFull = f;
    pending = 0;
  }
  return { perEntry, average: liters > 0 ? dist / liters : null };
}
const MAX_KM_PER_L = 80;

export function currentOdometer(entries: Entry[], base?: number | null): number | null {
  const odos = entries.map((e) => e.odometer).filter((o): o is number => o != null);
  if (base != null) odos.push(base);
  return odos.length ? Math.max(...odos) : null;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0); // clamp e.g. Jan 31 + 1 month -> Feb 28
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);

export type ReminderStatus = {
  progress: number; // 0..1+, whichever of km/time is further along
  dueKm: number | null;
  dueDate: string | null;
  kmLeft: number | null;
  daysLeft: number | null;
  state: "ok" | "soon" | "overdue" | "unknown";
};

export function reminderStatus(r: Reminder, odometer: number | null, todayIso: string): ReminderStatus {
  const lastOdo = r.effective_last_odometer;
  const lastDate = r.effective_last_date;
  const dueKm = r.interval_km && lastOdo != null ? lastOdo + r.interval_km : null;
  const dueDate = r.interval_months && lastDate ? addMonths(lastDate, r.interval_months) : null;
  const kmLeft = dueKm != null && odometer != null ? dueKm - odometer : null;
  const daysLeft = dueDate ? daysBetween(todayIso, dueDate) : null;
  const ratios: number[] = [];
  if (kmLeft != null && r.interval_km) ratios.push(1 - kmLeft / r.interval_km);
  if (daysLeft != null && dueDate && lastDate) {
    const span = daysBetween(lastDate, dueDate);
    if (span > 0) ratios.push(1 - daysLeft / span);
  }
  if (!ratios.length) return { progress: 0, dueKm, dueDate, kmLeft, daysLeft, state: "unknown" };
  const progress = Math.max(0, ...ratios);
  const state = progress >= 1 ? "overdue" : progress >= 0.85 ? "soon" : "ok";
  return { progress, dueKm, dueDate, kmLeft, daysLeft, state };
}
