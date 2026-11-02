// Importer for the "Car Notes" Android app's Excel export (one sheet per vehicle, sections per kind).
import { unzipSync, strFromU8 } from "fflate";

type Sheet = { name: string; rows: string[][] };

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

const colIndex = (ref: string) =>
  [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Minimal xlsx reader: cell values as strings, sheets in workbook order. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes);
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const strings = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescape([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const rels = new Map(
    [...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(
      (m) => [m[1]!, m[2]!.replace(/^\/?(xl\/)?/, "xl/")],
    ),
  );
  return [...text("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => {
    const xml = text(rels.get(m[2]!) ?? "");
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[2]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!;
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
        const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] ?? "")?.[1];
        const val = /t="s"/.test(attrs) && v != null ? strings[Number(v)] : unescape(inline ?? v ?? "");
        row[colIndex(ref)] = (val ?? "").trim();
      }
      rows[Number(r[1]) - 1] = Array.from(row, (x) => x ?? "");
    }
    return { name: unescape(m[1]!), rows: Array.from(rows, (x) => x ?? []) };
  });
}

// Car Notes service names (Portuguese UI + English defaults) -> our categories.
const SERVICE_MAP: Record<string, [kind: "service" | "expense", category: string]> = {
  "manutenção preventiva": ["service", "preventive"],
  "preventive maintenance": ["service", "preventive"],
  "óleo e filtro": ["service", "oil"],
  "óleo com filtro": ["service", "oil"],
  "oil and filter": ["service", "oil"],
  "oil with filter": ["service", "oil"],
  "filtro de ar do motor": ["service", "air_filter"],
  "engine air filter": ["service", "air_filter"],
  "filtro de cabine": ["service", "cabin_filter"],
  "cabin filter": ["service", "cabin_filter"],
  "pastilhas de freio": ["service", "brake_pads"],
  "brake pads": ["service", "brake_pads"],
  "discos e pastilhas de freio": ["service", "brake_discs"],
  "brake discs and pads": ["service", "brake_discs"],
  "fluido de freio": ["service", "brake_fluid"],
  "brake fluid": ["service", "brake_fluid"],
  "velas de ignição": ["service", "spark_plugs"],
  "spark plugs": ["service", "spark_plugs"],
  palhetas: ["service", "wipers"],
  wipers: ["service", "wipers"],
  "troca de pneus": ["service", "tires"],
  "tire change": ["service", "tires"],
  rodas: ["service", "alignment"],
  wheels: ["service", "alignment"],
  motor: ["service", "engine"],
  engine: ["service", "engine"],
  suspensão: ["service", "suspension"],
  suspension: ["service", "suspension"],
  câmbio: ["service", "transmission"],
  transmission: ["service", "transmission"],
  fluidos: ["service", "fluids"],
  fluids: ["service", "fluids"],
  "filtro de combustível": ["service", "fuel_filter"],
  "fuel filter": ["service", "fuel_filter"],
  "correia dentada": ["service", "timing_belt"],
  "timing belt": ["service", "timing_belt"],
  "correia do alternador": ["service", "accessory_belt"],
  "alternator belt": ["service", "accessory_belt"],
  "aditivo do radiador": ["service", "coolant"],
  "radiator coolant": ["service", "coolant"],
  "conserto de pneus": ["service", "tire_repair"],
  "tire repair": ["service", "tire_repair"],
  elétrica: ["service", "electrical"],
  electrical: ["service", "electrical"],
  "funilaria e pintura": ["service", "body_paint"],
  "body and paint": ["service", "body_paint"],
  guincho: ["service", "tow"],
  "tow truck": ["service", "tow"],
  "atualização de quilometragem": ["service", "odometer"],
  "mileage update": ["service", "odometer"],
  "outro serviço": ["service", "other"],
  "other service": ["service", "other"],
  lavagem: ["expense", "wash"],
  "car wash": ["expense", "wash"],
};

// Section titles -> entry kind.
const SECTIONS: Record<string, "fuel" | "service" | "upgrade" | "expense"> = {
  combustível: "fuel",
  fuel: "fuel",
  reparos: "service",
  repairs: "service",
  acessórios: "upgrade",
  accessories: "upgrade",
  papéis: "expense",
  documentos: "expense",
  papers: "expense",
  documents: "expense",
};

export type ImportEntry = {
  kind: "fuel" | "service" | "upgrade" | "expense";
  category: string | null;
  title: string | null;
  date: string;
  odometer: number | null;
  total: number;
  labor: number | null;
  notes: string | null;
  fuel_liters: number | null;
  fuel_price: number | null;
  fuel_type: string | null;
  full_tank: number | null;
  items: { name: string; part_number: string | null; qty: number; unit_price: number }[];
};
export type ImportVehicle = {
  name: string;
  type: string;
  plate: string | null;
  purchase_date: string | null;
  entries: ImportEntry[];
};

const num = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** dd/mm/yy -> yyyy-mm-dd. Dates after the export are typos in the app (wrong year) and move back a year. */
function parseDate(s: string, exportedOn: string): { iso: string; shifted: boolean } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = (yy: number) => `${yy}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return iso(y) > exportedOn ? { iso: iso(y - 1), shifted: true } : { iso: iso(y), shifted: false };
}

export function parseCarNotes(sheets: Sheet[], exportedOn: string) {
  const warnings: string[] = [];
  const vehicles: ImportVehicle[] = [];

  for (const sheet of sheets) {
    const v: ImportVehicle = { name: sheet.name, type: "car", plate: null, purchase_date: null, entries: [] };
    let kind: ImportEntry["kind"] | null = null;
    let header: string[] | null = null;

    for (const row of sheet.rows) {
      const first = (row[0] ?? "").toLowerCase();
      if (!row.some(Boolean)) continue;
      // Vehicle properties (key/value rows before the first section).
      if (!kind && row[1] !== undefined && !SECTIONS[first]) {
        if (first.startsWith("tipo de veículo") || first.startsWith("vehicle type")) {
          v.type = /moto/i.test(row[1]) ? "motorcycle" : /caminh|truck/i.test(row[1]) ? "truck" : "car";
        } else if (first.startsWith("placa") || first.includes("plate")) v.plate = row[1] || null;
        else if (first.includes("data de compra") || first.includes("purchase date")) {
          v.purchase_date = parseDate(row[1], exportedOn)?.iso ?? null;
        }
        continue;
      }
      if (SECTIONS[first] && row.filter(Boolean).length === 1) {
        kind = SECTIONS[first];
        header = null;
        continue;
      }
      if (!kind) continue;
      if (!header) {
        header = row.map((h) => h.toLowerCase());
        continue;
      }

      const col = (...names: string[]) => {
        const i = header!.findIndex((h) => names.some((n) => h.startsWith(n)));
        return i >= 0 ? row[i] : undefined;
      };
      const rawDate = col("data", "date") ?? "";
      const parsed = parseDate(rawDate, exportedOn);
      const where = `${sheet.name} ${rawDate}`;
      if (!parsed) {
        warnings.push(`${where}: unreadable date, skipped`);
        continue;
      }
      const date = parsed.iso;
      if (parsed.shifted) warnings.push(`${where}: date is after the export, imported as ${date}`);
      const odometer = num(col("quilometragem", "mileage", "odometer"));
      const total = num(col("custo total", "total"));
      const comment = col("comentário", "comment") || null;

      if (kind === "fuel") {
        const liters = num(col("volume"));
        const price = num(col("preço por litro", "price per"));
        if (!total && !liters) {
          warnings.push(`${where}: fuel entry with no cost or volume, skipped`);
          continue;
        }
        v.entries.push({
          kind, category: null, title: null, date, odometer,
          total: total ?? (liters && price ? Math.round(liters * price * 100) / 100 : 0),
          labor: null, notes: comment,
          fuel_liters: liters, fuel_price: price, fuel_type: col("tipo de combustível", "fuel type") || null,
          // Car Notes computes economy between every pair of fills, i.e. treats each as full.
          full_tank: 1, items: [],
        });
        continue;
      }

      const name = (col("reparos", "repairs", "acessórios", "accessories", "papéis", "documentos", "papers", "documents", "nome", "name") ?? "").trim();
      const mapped = SERVICE_MAP[name.toLowerCase()];
      const entryKind = kind === "service" && mapped ? mapped[0] : kind;
      const category = mapped && kind === "service" ? mapped[1] : "other";
      const parts = num(col("peças", "parts"));
      const labor = num(col("mão de obra", "labor"));
      const codes = col("códigos", "part code") || null;
      const sum = (parts ?? 0) + (labor ?? 0);
      // Itemize only when parts + labor add up to the total (no discount/tax to reconcile).
      const itemize = !!parts && (total == null || Math.abs(sum - total) < 0.01);
      v.entries.push({
        kind: entryKind, category,
        title: mapped ? null : name || null,
        date, odometer,
        total: itemize ? sum : (total ?? sum),
        labor: itemize ? labor : null,
        notes: [comment, !itemize && codes ? `Part codes: ${codes}` : null].filter(Boolean).join("\n") || null,
        fuel_liters: null, fuel_price: null, fuel_type: null, full_tank: null,
        items: itemize ? [{ name: name || "Parts", part_number: codes, qty: 1, unit_price: parts! }] : [],
      });
    }

    // Flag implausible odometer jumps (> 10,000 km between consecutive records less than 60 days apart).
    const withOdo = v.entries.filter((e) => e.odometer != null).sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < withOdo.length; i++) {
      const a = withOdo[i - 1]!, b = withOdo[i]!;
      const days = (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000;
      const delta = b.odometer! - a.odometer!;
      if (delta < 0 || (delta > 10_000 && days < 60)) {
        warnings.push(`${v.name} ${b.date}: odometer ${b.odometer} vs ${a.odometer} on ${a.date}, check it`);
      }
    }
    vehicles.push(v);
  }
  return { vehicles, warnings };
}
