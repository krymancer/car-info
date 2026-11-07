const SETTINGS_KEY = "car-info-settings";
export type Settings = { currency: string; locale: string };

export function getSettings(): Settings {
  const defaults = { currency: "BRL", locale: navigator.language || "pt-BR" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

let s = getSettings();
export const reloadSettings = () => (s = getSettings());

export const money = (n: number | null | undefined, digits = 2) =>
  new Intl.NumberFormat(s.locale, {
    style: "currency",
    currency: s.currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n ?? 0);

export const num = (n: number | null | undefined, digits = 0) =>
  n == null ? "–" : new Intl.NumberFormat(s.locale, { maximumFractionDigits: digits }).format(n);

export const km = (n: number | null | undefined) => (n == null ? "–" : `${num(n)} km`);

const parseDate = (iso: string) => new Date(`${iso}T12:00:00`);

export const date = (iso: string | null | undefined) =>
  iso ? parseDate(iso).toLocaleDateString(s.locale, { day: "2-digit", month: "short", year: "numeric" }) : "–";

export const monthLabel = (ym: string, long = true) =>
  parseDate(`${ym}-01`).toLocaleDateString(s.locale, long ? { month: "long", year: "numeric" } : { month: "short" });

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Parses user-typed numbers in either 1.234,56 or 1,234.56 style. When both separators appear, the
 * last one is the decimal point; a separator that repeats ("1.234.567") groups thousands.
 * `grouped`: a lone separator followed by exactly three digits also groups thousands ("20.100" is
 * 20100). Use it for amounts that never have three decimals, like a car's price; not for fuel
 * prices, where 6.199 is a real price per liter.
 */
export function parseNum(v: string, { grouped = false } = {}): number | null {
  const t = v.trim().replace(/\s/g, "");
  if (!t) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let norm = t;
  if (lastComma >= 0 && lastDot >= 0) {
    norm = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const repeated = t.indexOf(sep) !== t.lastIndexOf(sep);
    const thousands = repeated || (grouped && /^-?\d+[.,]\d{3}$/.test(t));
    norm = thousands ? t.split(sep).join("") : t.replace(",", ".");
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Parses whole numbers (odometer, year): dots, commas and spaces are only digit grouping. */
export function parseWhole(v: string): number | null {
  const t = v.trim().replace(/[\s.,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const QUICK_FUEL_KEY = "car-info-quick-fuel";
export const quickFuelOnLaunch = () => localStorage.getItem(QUICK_FUEL_KEY) !== "0";
export const setQuickFuelOnLaunch = (on: boolean) => localStorage.setItem(QUICK_FUEL_KEY, on ? "1" : "0");
