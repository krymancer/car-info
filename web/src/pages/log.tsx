import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CarFront, ListOrdered, Plus, Search } from "lucide-react";
import type { Kind } from "@/lib/api";
import { KINDS, KIND_ORDER, entryLabel } from "@/lib/categories";
import { money, monthLabel } from "@/lib/format";
import { useCurrentVehicle, useEntries } from "@/lib/hooks";
import { fuelEconomy } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { EntryRow, PendingRow } from "@/components/entry-row";
import { discard, useOutbox } from "@/lib/outbox";
import { EmptyState, Fab } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const KIND_HINT: Record<Kind, string> = {
  service: "Repairs, oil changes, parts swapped",
  upgrade: "Mods, accessories, improvements",
  expense: "Taxes, insurance, fines, parking, wash",
  fuel: "Fill-ups and fuel economy",
};

export function LogPage() {
  const { vehicle, isLoading } = useCurrentVehicle();
  const entries = useEntries(vehicle?.id);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const pending = useOutbox().filter((p) => p.body.vehicle_id === vehicle?.id);

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
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search parts, shops, notes…"
          className="h-10 rounded-xl pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
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
            <div className="mb-1 flex items-baseline justify-between px-2">
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

      <Fab onClick={() => setAdding(true)} label="Add" icon={Plus} />

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
