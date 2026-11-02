import { describe, expect, test } from "bun:test";
import type { Entry, Reminder } from "./api";
import { addMonths, fillMonths, fuelEconomy, inPeriod, reminderStatus, summarize } from "./stats";

let n = 0;
const entry = (p: Partial<Entry>): Entry => ({
  id: String(++n), vehicle_id: "v", kind: "service", category: null, title: null, date: "2026-01-01",
  odometer: null, total: 0, labor: null, shop: null, notes: null, fuel_liters: null, fuel_price: null,
  fuel_type: null, full_tank: null, items: [], ...p,
});

describe("stats", () => {
  test("fuel economy uses full-tank to full-tank, counting partial fills", () => {
    const fills = [
      entry({ kind: "fuel", odometer: 1000, fuel_liters: 40, full_tank: 1 }),
      entry({ kind: "fuel", odometer: 1200, fuel_liters: 10, full_tank: 0 }),
      entry({ kind: "fuel", odometer: 1500, fuel_liters: 40, full_tank: 1 }),
    ];
    const { perEntry, average } = fuelEconomy(fills);
    expect(average).toBe(10); // 500 km / 50 L
    expect(perEntry.get(fills[2].id)).toBe(10);
    expect(perEntry.has(fills[1].id)).toBe(false);
  });

  test("fuel economy counts fills without odometer and ignores odometer typos", () => {
    const fills = [
      entry({ kind: "fuel", date: "2026-07-22", odometer: 50000, fuel_liters: 35, full_tank: 1 }),
      entry({ kind: "fuel", date: "2026-09-13", odometer: null, fuel_liters: 30, full_tank: 1 }),
      entry({ kind: "fuel", date: "2026-10-11", odometer: 50400, fuel_liters: 30, full_tank: 1 }),
      entry({ kind: "fuel", date: "2026-10-20", odometer: 84000, fuel_liters: 30, full_tank: 1 }),
    ];
    const { perEntry } = fuelEconomy(fills);
    expect(100 / perEntry.get(fills[2].id)!).toBeCloseTo(15, 2); // 400 km on 30 + 30 L, like Car Notes' L/100 km
    expect(perEntry.has(fills[3].id)).toBe(false);
  });

  test("summarize totals by kind, category, distance", () => {
    const s = summarize([
      entry({ kind: "service", category: "oil", total: 200, odometer: 1000, labor: 50,
        items: [{ name: "oil", brand: null, part_number: null, qty: 1, unit_price: 150 }] }),
      entry({ kind: "upgrade", total: 300, odometer: 2000, date: "2026-03-01" }),
    ]);
    expect(s.total).toBe(500);
    expect(s.byKind.upgrade).toBe(300);
    expect(s.costPerKm).toBe(0.5);
    expect(s.partsTotal).toBe(150);
    expect(fillMonths(s.byMonth).map(([m]) => m)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  test("period filters", () => {
    const es = [entry({ date: "2025-06-01" }), entry({ date: "2026-02-01" })];
    expect(inPeriod(es, "year", "2026-11-01")).toHaveLength(1);
    expect(inPeriod(es, "12m", "2026-11-01")).toHaveLength(1);
    expect(inPeriod(es, "2025", "2026-11-01")).toHaveLength(1);
  });

  test("reminder progress uses whichever limit is closer", () => {
    const r = {
      id: "r", vehicle_id: "v", title: "Timing belt", category: "timing_belt", interval_km: 90000,
      interval_months: 60, last_date: null, last_odometer: null, notes: null,
      effective_last_date: "2026-01-28", effective_last_odometer: 120000,
    } as Reminder;
    const st = reminderStatus(r, 154000, "2026-11-01");
    expect(st.dueKm).toBe(210000);
    expect(st.dueDate).toBe("2031-01-28");
    expect(Math.round(st.progress * 100)).toBe(38);
    expect(st.state).toBe("ok");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});
