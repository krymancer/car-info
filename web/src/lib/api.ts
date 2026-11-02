export type Kind = "fuel" | "service" | "upgrade" | "expense";

export type Vehicle = {
  id: string;
  name: string;
  type: "car" | "motorcycle" | "truck" | "other";
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  vin: string | null;
  fuel_type: string | null;
  tank_capacity: number | null;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_odometer: number | null;
  notes: string | null;
  archived: 0 | 1;
  last_odometer?: number | null;
};

export type Item = {
  id?: string;
  name: string;
  brand: string | null;
  part_number: string | null;
  qty: number;
  unit_price: number;
};

export type Entry = {
  id: string;
  vehicle_id: string;
  kind: Kind;
  category: string | null;
  title: string | null;
  date: string;
  odometer: number | null;
  total: number;
  labor: number | null;
  shop: string | null;
  notes: string | null;
  fuel_liters: number | null;
  fuel_price: number | null;
  fuel_type: string | null;
  full_tank: 0 | 1 | null;
  items: Item[];
  attachment_count?: number;
};

export type Attachment = {
  id: string;
  vehicle_id: string;
  entry_id: string | null;
  name: string;
  mime: string;
  size: number;
  created_at: string;
};

export type Reminder = {
  id: string;
  vehicle_id: string;
  title: string;
  category: string | null;
  interval_km: number | null;
  interval_months: number | null;
  last_date: string | null;
  last_odometer: number | null;
  notes: string | null;
  effective_last_date: string | null;
  effective_last_odometer: number | null;
};

const TOKEN_KEY = "car-info-token";
const SERVER_KEY = "car-info-server";

/** Empty = same origin (web/PWA). The Android app stores the homelab URL here. */
export const getServerUrl = () => localStorage.getItem(SERVER_KEY) ?? "";
export const setServerUrl = (url: string) =>
  url ? localStorage.setItem(SERVER_KEY, url.replace(/\/+$/, "")) : localStorage.removeItem(SERVER_KEY);
export const isNativeApp = () => "Capacitor" in window;
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const raw = init.body instanceof Blob || init.body instanceof FormData;
  const res = await fetch(`${getServerUrl()}/api${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined && !raw ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : raw ? (init.body as Blob | FormData) : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("car-info:unauthorized"));
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return data as T;
}

/** Network failure (server unreachable), as opposed to the server answering with an error. */
export const isOffline = (e: unknown) => e instanceof TypeError;

export const uploadAttachment = (target: { vehicle_id?: string; entry_id?: string }, file: Blob, name: string) => {
  const form = new FormData();
  form.set("file", file, name);
  return api<Attachment>(`/attachments?${new URLSearchParams(target as Record<string, string>)}`, { method: "POST", body: form });
};

/** Direct URL for <img>/<a>. Carries the token because the Android app can't attach headers or cookies to those. */
export const fileUrl = (id: string, download = false) => {
  const q = new URLSearchParams();
  const token = getToken();
  if (token) q.set("token", token);
  if (download) q.set("download", "1");
  return `${getServerUrl()}/api/attachments/${id}/file${q.size ? `?${q}` : ""}`;
};

/** Downloads an API file (backup) with auth, which plain links can't do cross-origin. */
export async function download(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${getServerUrl()}/api${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  saveBlob(await res.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
