// Column whitelists with light type coercion. Anything not listed is dropped.
type FieldType = "text" | "int" | "real" | "bool" | "date";
type Spec = Record<string, FieldType>;

export const vehicleFields: Spec = {
  name: "text",
  type: "text",
  make: "text",
  model: "text",
  year: "int",
  plate: "text",
  vin: "text",
  fuel_type: "text",
  tank_capacity: "real",
  purchase_date: "date",
  purchase_price: "real",
  purchase_odometer: "int",
  notes: "text",
  archived: "bool",
};

export const entryFields: Spec = {
  kind: "text",
  category: "text",
  title: "text",
  date: "date",
  odometer: "int",
  total: "real",
  labor: "real",
  shop: "text",
  notes: "text",
  fuel_liters: "real",
  fuel_price: "real",
  fuel_type: "text",
  full_tank: "bool",
};

export const itemFields: Spec = {
  name: "text",
  brand: "text",
  part_number: "text",
  qty: "real",
  unit_price: "real",
};

export const reminderFields: Spec = {
  title: "text",
  category: "text",
  interval_km: "int",
  interval_months: "int",
  last_date: "date",
  last_odometer: "int",
  notes: "text",
};

export const ENTRY_KINDS = ["fuel", "service", "upgrade", "expense"] as const;

export class BadRequest extends Error {}

function coerce(key: string, type: FieldType, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  switch (type) {
    case "text":
      return String(v).trim() || null;
    case "int":
    case "real": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) throw new BadRequest(`${key} must be a number`);
      return type === "int" ? Math.round(n) : Math.round(n * 1000) / 1000;
    }
    case "bool":
      return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
    case "date": {
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequest(`${key} must be YYYY-MM-DD`);
      return s;
    }
  }
}

/** Returns only whitelisted, coerced fields that were present in `input`. */
export function pick(spec: Spec, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") throw new BadRequest("expected an object");
  const out: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(spec)) {
    const v = coerce(key, type, (input as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}
