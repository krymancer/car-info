import { expect, test } from "bun:test";
import type { Entry, Vehicle } from "./api";
import { entriesCsv } from "./csv";

const base: Entry = {
  id: "1", vehicle_id: "v1", kind: "service", category: "oil", title: "Troca de óleo; 10k", date: "2026-03-01",
  odometer: 120000, total: 234.6, labor: 50, shop: null, notes: 'filtro "original"', fuel_liters: null,
  fuel_price: null, fuel_type: null, full_tank: null,
  items: [{ name: "Óleo 5W30", brand: "Mobil", part_number: null, qty: 4, unit_price: 39.9 }, { name: "Filtro", brand: null, part_number: "PH5949", qty: 1, unit_price: 25 }],
};
const vehicles = [{ id: "v1", name: "Civic" }] as Vehicle[];

test("pt-BR uses ; and decimal commas, quoting what needs it", () => {
  const [header, row] = entriesCsv([base], vehicles, "pt-BR").replace("﻿", "").split("\r\n");
  expect(header!.startsWith("Date;Vehicle;Type;Category")).toBe(true);
  expect(row).toBe(
    '2026-03-01;Civic;Maintenance;Oil & filter;"Troca de óleo; 10k";120000;234,6;184,6;50;;;;;;4x Óleo 5W30 (Mobil) | Filtro #PH5949;"filtro ""original"""',
  );
});

test("en-US uses , and plain numbers", () => {
  const fuel: Entry = { ...base, kind: "fuel", category: null, title: null, notes: null, items: [], labor: null, total: 154.54, fuel_liters: 22.43, fuel_price: 6.89, fuel_type: "Regular", full_tank: 1 };
  const row = entriesCsv([fuel], vehicles, "en-US").split("\r\n")[1];
  expect(row).toBe("2026-03-01,Civic,Fuel,,,120000,154.54,,,22.43,6.89,Regular,yes,,,");
});
