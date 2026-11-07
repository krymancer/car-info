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

/** An odometer/instrument cluster replacement: the old unit's last reading and the new one's first. */
export type OdometerSwap = { date: string; before: number; after: number };

export function odometerSwaps(entries: Entry[]): OdometerSwap[] {
  return entries
    .filter((e) => e.odometer != null && e.odometer_after != null)
    .map((e) => ({ date: e.date, before: e.odometer!, after: e.odometer_after! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Moves a reading taken on `date` onto the scale of the odometer installed now, so distances across
 * a swap are the km actually driven. A reading on the swap day itself belongs to whichever unit it is
 * closer to. Pass an empty date for readings that predate every record (purchase odometer).
 */
export function onCurrentScale(swaps: OdometerSwap[], date: string, reading: number): number {
  let r = reading;
  for (const s of swaps) {
    const before = date < s.date || (date === s.date && Math.abs(r - s.before) < Math.abs(r - s.after));
    if (before) r += s.after - s.before;
  }
  return r;
}

/** The same entries with every odometer reading on the current unit's scale. */
export function continuousOdometer(entries: Entry[]): Entry[] {
  const swaps = odometerSwaps(entries);
  if (!swaps.length) return entries;
  return entries.map((e) =>
    e.odometer == null ? e : { ...e, odometer: onCurrentScale(swaps, e.date, e.odometer) },
  );
}

/**
 * Guesses both readings for a swap on `date` from the readings around it, assuming the car kept its
 * usual pace (km/day over the old unit's history) through the gap. Null without a reading on each side.
 */
export function estimateSwap(entries: Entry[], date: string, ignoreId?: string): { before: number; after: number } | null {
  const readings = continuousOdometer(entries.filter((e) => e.id !== ignoreId && e.odometer_after == null))
    .filter((e) => e.odometer != null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer! - b.odometer!);
  const prior = readings.filter((e) => e.date < date);
  const next = readings.find((e) => e.date > date);
  const prev = prior.at(-1);
  if (!prev || !next) return null;
  const first = prior[0];
  const span = daysBetween(first.date, prev.date);
  const perDay = span > 0 ? Math.max(0, (prev.odometer! - first.odometer!) / span) : 0;
  return {
    before: Math.round(prev.odometer! + perDay * daysBetween(prev.date, date)),
    after: Math.round(next.odometer! - perDay * daysBetween(date, next.date)),
  };
}

export type KindTotals = Record<Kind, number>;
const zero = (): KindTotals => ({ service: 0, upgrade: 0, expense: 0, fuel: 0 });

export function summarize(all: Entry[]) {
  const entries = continuousOdometer(all);
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
  const fills = continuousOdometer(entries)
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

/** The reading the dashboard shows now, given `base` (purchase odometer) for a vehicle with no records. */
export function currentOdometer(entries: Entry[], base?: number | null): number | null {
  const odos = continuousOdometer(entries).map((e) => e.odometer).filter((o): o is number => o != null);
  if (base != null) odos.push(onCurrentScale(odometerSwaps(entries), "", base));
  return odos.length ? Math.max(...odos) : null;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0); // clamp e.g. Jan 31 + 1 month -> Feb 28
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
}

export type ReminderStatus = {
  progress: number; // 0..1+, whichever of km/time is further along
  dueKm: number | null;
  dueDate: string | null;
  kmLeft: number | null;
  daysLeft: number | null;
  state: "ok" | "soon" | "overdue" | "unknown";
};

/** `swaps`: the vehicle's odometer swaps, so a service logged on the old unit still counts. */
export function reminderStatus(r: Reminder, odometer: number | null, todayIso: string, swaps: OdometerSwap[] = []): ReminderStatus {
  const lastOdo =
    r.effective_last_odometer != null && swaps.length
      ? onCurrentScale(swaps, r.effective_last_date ?? "", r.effective_last_odometer)
      : r.effective_last_odometer;
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
