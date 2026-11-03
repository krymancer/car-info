import { Link } from "react-router";
import { CloudOff, Paperclip, X } from "lucide-react";
import type { Pending } from "@/lib/outbox";
import type { Entry } from "@/lib/api";
import { KINDS, entryIcon, entryLabel } from "@/lib/categories";
import { date, km, money, num } from "@/lib/format";

export function KindIcon({ entry, className = "size-11" }: { entry: Pick<Entry, "kind" | "category">; className?: string }) {
  const Icon = entryIcon(entry);
  const color = KINDS[entry.kind].color;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, color }}
    >
      <Icon className="size-5" />
    </div>
  );
}

/** Phone: icon, label, one line of details. Desktop: the same row laid out as table columns (see `ENTRY_COLUMNS`). */
export const ENTRY_COLUMNS = "lg:grid lg:grid-cols-[2.25rem_minmax(0,1fr)_9rem_7rem_8rem_7rem] lg:gap-4";

export function EntryRow({ entry, economy }: { entry: Entry; economy?: number }) {
  const extra: string[] = [];
  if (entry.kind === "fuel") {
    if (entry.fuel_liters) extra.push(`${num(entry.fuel_liters, 2)} L`);
  } else if (entry.items.length) {
    extra.push(`${entry.items.length} part${entry.items.length > 1 ? "s" : ""}`);
  }
  if (entry.shop) extra.push(entry.shop);
  const phone = [date(entry.date), entry.odometer != null && km(entry.odometer), ...extra].filter(Boolean).join(" · ");
  const rate =
    entry.kind === "fuel"
      ? economy ? `${num(economy, 2)} km/L` : entry.fuel_price ? `${money(entry.fuel_price, 2)}/L` : ""
      : "";

  return (
    <Link
      to={`/entry/${entry.id}`}
      className={`flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-card active:bg-card lg:items-center lg:rounded-lg lg:py-1.5 ${ENTRY_COLUMNS}`}
    >
      <KindIcon entry={entry} className="size-11 lg:size-9" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {entryLabel(entry)}
          {!!entry.attachment_count && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has receipts" />}
        </p>
        <p className="truncate text-xs text-muted-foreground lg:hidden">{phone}</p>
        <p className="hidden truncate text-xs text-muted-foreground lg:block">{extra.join(" · ")}</p>
      </div>
      <span className="hidden text-sm whitespace-nowrap text-muted-foreground tabular-nums lg:block">{date(entry.date)}</span>
      <span className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">{entry.odometer != null ? km(entry.odometer) : ""}</span>
      <span className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">{rate}</span>
      <div className="text-right">
        <p className="font-medium tabular-nums">{money(entry.total)}</p>
        {rate && <p className="text-xs text-muted-foreground tabular-nums lg:hidden">{rate}</p>}
      </div>
    </Link>
  );
}

/** A record saved on this device while the server was unreachable. */
export function PendingRow({ pending, onDiscard }: { pending: Pending; onDiscard: () => void }) {
  const e = pending.body as unknown as Entry;
  return (
    <div className="flex items-center gap-3 rounded-xl p-2">
      <KindIcon entry={e} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entryLabel(e)}</p>
        <p className={`flex items-center gap-1 truncate text-xs ${pending.error ? "text-destructive" : "text-muted-foreground"}`}>
          <CloudOff className="size-3 shrink-0" /> {pending.error ?? `${date(e.date)} · waiting to sync`}
        </p>
      </div>
      <p className="font-medium tabular-nums">{money(Number(e.total ?? 0))}</p>
      {pending.error && (
        <button onClick={onDiscard} aria-label="Discard" className="p-1 text-muted-foreground"><X className="size-4" /></button>
      )}
    </div>
  );
}
