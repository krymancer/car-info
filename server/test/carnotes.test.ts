import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { parseCarNotes, readXlsx } from "../src/carnotes";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/carnotes-export.xlsx`).arrayBuffer());

describe("car notes import", () => {
  const { vehicles, warnings } = parseCarNotes(readXlsx(file), "2026-11-01");
  const [bike, hilux, corolla] = vehicles;

  test("reads vehicles and their properties", () => {
    expect(vehicles.map((v) => v.name)).toEqual(["Bros 160", "Hilux", "Corolla XEi 2.0"]);
    expect(bike!.type).toBe("motorcycle");
    expect(hilux!.plate).toBe("DEM-0A02");
    expect(corolla!.purchase_date).toBe("2025-03-15");
  });

  test("maps fuel and repairs", () => {
    const fill = corolla!.entries.find((e) => e.date === "2026-10-19")!;
    expect(fill).toMatchObject({ kind: "fuel", odometer: 224904, total: 162.88, fuel_liters: 24.31, fuel_price: 6.7, fuel_type: "Regular" });
    const belt = corolla!.entries.find((e) => e.kind === "service")!;
    expect(belt).toMatchObject({ category: "timing_belt", date: "2026-01-26", odometer: 190306, title: null });
    expect(hilux!.entries.find((e) => e.kind === "service")!.category).toBe("oil");
  });

  test("skips empty rows and fixes future years", () => {
    expect(hilux!.entries.filter((e) => e.kind === "fuel")).toHaveLength(12); // 13 rows, 1 empty
    expect(corolla!.entries.filter((e) => e.kind === "fuel")).toHaveLength(16); // 18 rows, 2 empty
    expect(corolla!.entries.some((e) => e.date === "2025-12-28")).toBe(true);
    expect(hilux!.entries.some((e) => e.date === "2025-12-28")).toBe(true);
    expect(warnings.some((w) => w.includes("223320"))).toBe(true); // +32,650 km in a month
  });

  test("merges without duplicates", async () => {
    const app = createApp(openDb(":memory:"), { filesDir: mkdtempSync(join(tmpdir(), "car-info-files-")) });
    const post = async (q: string) =>
      (await app.request(`/api/import/carnotes?exported_at=2026-11-01${q}`, { method: "POST", body: file })).json() as any;
    const preview = await post("&dry_run=1");
    expect(preview.vehicles.map((v: any) => v.new_entries)).toEqual([3, 13, 17]);
    expect(((await (await app.request("/api/vehicles")).json()) as any[]).length).toBe(0);
    await post("");
    const again = await post("");
    expect(again.vehicles.map((v: any) => v.new_entries)).toEqual([0, 0, 0]);
    expect(((await (await app.request("/api/entries")).json()) as any[]).length).toBe(33);
  });
});
