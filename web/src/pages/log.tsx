import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CarFront, ListOrdered, Plus, Search } from "lucide-react";
import type { Entry, Kind, Vehicle } from "@/lib/api";
import { KINDS, KIND_HINT, KIND_ORDER, entryLabel } from "@/lib/categories";
import { date, km, money, monthLabel, num, today } from "@/lib/format";
import { useCurrentVehicle, useEntries, useReminders } from "@/lib/hooks";
import { currentOdometer, fuelEconomy, reminderStatus, summarize } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { ENTRY_COLUMNS, EntryRow, PendingRow } from "@/components/entry-row";
import { discard, useOutbox } from "@/lib/outbox";
import { EmptyState, Fab } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function LogPage() {
  const { vehicle, isLoading } = useCurrentVehicle();
  const entries = useEntries(vehicle?.id);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const pending = useOutbox().filter((p) => p.body.vehicle_id === vehicle?.id);
  const search = useRef<HTMLInputElement>(null);
  // "/" jumps to search, like most desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      search.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const economy = useMemo(() => fuelEconomy(entries.data ?? []).perEntry, [entries.data]);
  const months = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (entries.data ?? []).filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!q) return true;
      const haystack = [entryLabel(e), e.notes, e.shop, ...e.items.flatMap((i) => [i.name, i.brand, i.part_number])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    const groups = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const ym = e.date.slice(0, 7);
      groups.set(ym, [...(groups.get(ym) ?? []), e]);
    }
    return [...groups.entries()];
  }, [entries.data, kind, query]);

  if (isLoading || entries.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!vehicle) {
    return (
      <EmptyState icon={CarFront} title="Add your first vehicle">
        <Button asChild className="mt-2"><Link to="/garage/new">Add vehicle</Link></Button>
      </EmptyState>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8">
    <div className="space-y-4">
      <div className="space-y-4 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
      <div className="relative lg:w-80">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={search}
          placeholder="Search parts, shops, notes…"
          className="h-10 rounded-xl pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
        {(["all", ...KIND_ORDER] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1 text-sm",
              kind === k ? "border-foreground/30 bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            {k === "all" ? "All" : KINDS[k].plural}
          </button>
        ))}
      </div>
      </div>

      {months.length > 0 && (
        <div className={cn("hidden text-xs text-muted-foreground", ENTRY_COLUMNS)}>
          <span className="col-span-2">Record</span>
          <span>Date</span>
          <span className="text-right">Odometer</span>
          <span className="text-right">Economy / price</span>
          <span className="text-right">Total</span>
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-1 px-2 text-sm font-semibold">Not synced yet</h2>
          <div className="-mx-2">
            {pending.map((p) => <PendingRow key={p.key} pending={p} onDiscard={() => discard(p.key)} />)}
          </div>
        </section>
      )}

      {months.length === 0 && pending.length === 0 ? (
        <EmptyState icon={ListOrdered} title={entries.data?.length ? "Nothing matches" : "No records yet"}>
          {!entries.data?.length && "Log maintenance, upgrades, fuel and expenses to see where your money goes."}
        </EmptyState>
      ) : (
        months.map(([ym, list]) => (
          <section key={ym}>
            <div className="mb-1 flex items-baseline justify-between px-2 lg:mt-2 lg:border-b lg:px-0 lg:pb-1.5">
              <h2 className="text-sm font-semibold capitalize">{monthLabel(ym)}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {money(list.reduce((s, e) => s + e.total, 0))}
              </span>
            </div>
            <div className="-mx-2">
              {list.map((e) => <EntryRow key={e.id} entry={e} economy={economy.get(e.id)} />)}
            </div>
          </section>
        ))
      )}

    </div>

      <LogSidebar vehicle={vehicle} entries={entries.data ?? []} />

      <Fab
        onClick={() => setAdding(true)}
        label="Add"
        icon={Plus}
        desktop={null}
      />

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side="bottom" className="mx-auto max-w-2xl rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>What are you logging?</SheetTitle></SheetHeader>
          <div className="grid gap-1 px-2">
            {KIND_ORDER.map((k) => {
              const Icon = KINDS[k].icon;
              return (
                <button
                  key={k}
                  onClick={() => navigate(`/entry/new?kind=${k}`)}
                  className="flex items-center gap-3 rounded-xl p-3 text-left hover:bg-secondary"
                >
                  <div
                    className="flex size-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in oklch, ${KINDS[k].color} 18%, transparent)`, color: KINDS[k].color }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium">{KINDS[k].label}</p>
                    <p className="text-xs text-muted-foreground">{KIND_HINT[k]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Desktop-only overview next to the log: this year's spending and what's due. */
function LogSidebar({ vehicle, entries }: { vehicle: Vehicle; entries: Entry[] }) {
  const reminders = useReminders(vehicle.id);
  const year = today().slice(0, 4);
  const s = useMemo(() => summarize(entries.filter((e) => e.date.startsWith(year))), [entries, year]);
  const odo = currentOdometer(entries, vehicle.purchase_odometer);
  const economy = useMemo(() => fuelEconomy(entries).average, [entries]);
  const due = (reminders.data ?? [])
    .map((r) => ({ r, s: reminderStatus(r, odo, today()) }))
    .filter((x) => x.s.state === "overdue" || x.s.state === "soon")
    .sort((a, b) => b.s.progress - a.s.progress)
    .slice(0, 4);

  return (
    <aside className="sticky top-6 hidden space-y-4 lg:block">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Spent in {year}</p>
        <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{money(s.total, 0)}</p>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
          {KIND_ORDER.map((k) => (
            <div key={k} style={{ width: `${(s.byKind[k] / (s.total || 1)) * 100}%`, background: KINDS[k].color }} />
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          {KIND_ORDER.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: KINDS[k].color }} />
              <span className="flex-1 text-muted-foreground">{KINDS[k].plural}</span>
              <span className="tabular-nums">{money(s.byKind[k], 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 text-sm">
        <div><p className="text-xs text-muted-foreground">Odometer</p><p className="font-medium tabular-nums">{odo != null ? km(odo) : "–"}</p></div>
        <div><p className="text-xs text-muted-foreground">Economy</p><p className="font-medium tabular-nums">{economy ? `${num(economy, 1)} km/L` : "–"}</p></div>
      </div>

      {due.length > 0 && (
        <Link to="/reminders" className="block space-y-2 rounded-2xl border bg-card p-4 hover:border-foreground/20">
          <p className="text-sm font-semibold">Coming up</p>
          {due.map(({ r, s: st }) => (
            <div key={r.id} className="flex justify-between gap-2 text-sm">
              <span className="truncate">{r.title}</span>
              <span className={cn("shrink-0 text-xs", st.state === "overdue" ? "text-destructive" : "text-amber-400")}>
                {st.state === "overdue" ? "Overdue" : st.dueDate ? date(st.dueDate) : st.dueKm != null ? km(st.dueKm) : "Soon"}
              </span>
            </div>
          ))}
        </Link>
      )}
    </aside>
  );
}
