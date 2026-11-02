import type { Entry, Vehicle } from "./api";
import { KINDS, categoryOf } from "./categories";

const HEADER = [
  "Date", "Vehicle", "Type", "Category", "Description", "Odometer (km)", "Total", "Parts", "Labor",
  "Liters", "Price per liter", "Fuel type", "Full tank", "Shop / station", "Part list", "Notes",
];

/**
 * One row per record. Locales that write decimals with a comma (pt-BR) get `;` as the separator,
 * which is what Excel/LibreOffice expect there; numbers are left unformatted otherwise so they stay numbers.
 */
export function entriesCsv(entries: Entry[], vehicles: Vehicle[], locale: string): string {
  const comma = (1.5).toLocaleString(locale).includes(",");
  const sep = comma ? ";" : ",";
  const n = (v: number | null | undefined) => (v == null ? "" : comma ? String(v).replace(".", ",") : String(v));
  const cell = (v: string | number | null | undefined) => {
    const s = typeof v === "number" ? n(v) : (v ?? "");
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const names = new Map(vehicles.map((v) => [v.id, v.name]));
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? 0) - (b.odometer ?? 0))
    .map((e) => {
      const parts = e.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
      const partList = e.items
        .map((i) => [i.qty !== 1 ? `${i.qty}x` : "", i.name, i.brand && `(${i.brand})`, i.part_number && `#${i.part_number}`].filter(Boolean).join(" "))
        .join(" | ");
      return [
        e.date,
        names.get(e.vehicle_id) ?? "",
        KINDS[e.kind].label,
        e.kind === "fuel" ? "" : (categoryOf(e.kind, e.category)?.label ?? e.category ?? ""),
        e.title ?? "",
        e.odometer,
        e.total,
        e.items.length ? Math.round(parts * 100) / 100 : null,
        e.labor,
        e.fuel_liters,
        e.fuel_price,
        e.fuel_type ?? "",
        e.kind === "fuel" ? (e.full_tank ? "yes" : "no") : "",
        e.shop ?? "",
        partList,
        e.notes ?? "",
      ].map(cell).join(sep);
    });
  return "﻿" + [HEADER.join(sep), ...rows].join("\r\n") + "\r\n";
}
