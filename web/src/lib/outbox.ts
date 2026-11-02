import { useSyncExternalStore } from "react";
import { api, ApiError, isOffline, type Entry } from "./api";

// New records saved while the server is unreachable (e.g. at a gas station without Tailscale). They are
// kept on the device and posted, oldest first, as soon as the server answers again.
const KEY = "car-info-outbox";

export type Pending = { key: string; queued_at: string; body: Record<string, unknown>; error?: string };

const listeners = new Set<() => void>();
let cache: Pending[] | null = null;

function read(): Pending[] {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      cache = [];
    }
  }
  return cache!;
}
function write(list: Pending[]) {
  cache = list;
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export const useOutbox = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    read,
  );

/** Posts a new entry, or queues it when offline. Returns the created entry, or null if queued. */
export async function createEntry(body: Record<string, unknown>): Promise<Entry | null> {
  try {
    return await api<Entry>("/entries", { method: "POST", body });
  } catch (e) {
    if (!isOffline(e)) throw e;
    write([...read(), { key: crypto.randomUUID(), queued_at: new Date().toISOString(), body }]);
    return null;
  }
}

export const discard = (key: string) => write(read().filter((p) => p.key !== key));

let flushing: Promise<number> | null = null;

/** Sends queued entries. Resolves to how many were sent; stops at the first network failure. */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const p of read()) {
        try {
          await api("/entries", { method: "POST", body: p.body });
        } catch (e) {
          if (isOffline(e)) break;
          // The server rejected it (e.g. the vehicle was deleted); keep it visible so it can be discarded.
          if (e instanceof ApiError && e.status === 401) break;
          if (e instanceof ApiError) {
            write(read().map((x) => (x.key === p.key ? { ...x, error: e.message } : x)));
            continue;
          }
          throw e;
        }
        discard(p.key);
        sent++;
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}
