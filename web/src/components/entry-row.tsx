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

export function EntryRow({ entry, economy }: { entry: Entry; economy?: number }) {
  const details: string[] = [date(entry.date)];
  if (entry.odometer != null) details.push(km(entry.odometer));
  if (entry.kind === "fuel") {
    if (entry.fuel_liters) details.push(`${num(entry.fuel_liters, 2)} L`);
  } else if (entry.items.length) {
    details.push(`${entry.items.length} part${entry.items.length > 1 ? "s" : ""}`);
  }
  if (entry.shop) details.push(entry.shop);

  return (
    <Link
      to={`/entry/${entry.id}`}
      className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-card active:bg-card"
    >
      <KindIcon entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {entryLabel(entry)}
          {!!entry.attachment_count && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has receipts" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
      </div>
      <div className="text-right">
        <p className="font-medium tabular-nums">{money(entry.total)}</p>
        {entry.kind === "fuel" && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {economy ? `${num(economy, 2)} km/L` : entry.fuel_price ? `${money(entry.fuel_price, 2)}/L` : ""}
          </p>
        )}
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
