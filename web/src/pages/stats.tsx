import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BarChart3, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Kind } from "@/lib/api";
import { KINDS, KIND_ORDER, categoryOf } from "@/lib/categories";
import { km, money, num, today } from "@/lib/format";
import { useCurrentVehicle, useEntries } from "@/lib/hooks";
import { fillMonths, fuelEconomy, inPeriod, summarize, type Period } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shell";
import { KindIcon } from "@/components/entry-row";
import { MonthChart } from "@/components/month-chart";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsPage() {
  const { vehicle, isLoading } = useCurrentVehicle();
  const entries = useEntries(vehicle?.id);
  const [period, setPeriod] = useState<Period>("12m");
  const [withFuel, setWithFuel] = useState(true);

  const all = entries.data ?? [];
  const years = useMemo(() => [...new Set(all.map((e) => e.date.slice(0, 4)))].sort().reverse(), [all]);
  const scoped = useMemo(() => inPeriod(all, period, today()), [all, period]);
  const s = useMemo(() => summarize(withFuel ? scoped : scoped.filter((e) => e.kind !== "fuel")), [scoped, withFuel]);
  const economy = useMemo(() => fuelEconomy(scoped).average, [scoped]);

  if (isLoading || entries.isLoading) return <Skeleton className="h-60 w-full" />;
  if (!vehicle) return <EmptyState icon={BarChart3} title="Add a vehicle first" />;

  const kinds: Kind[] = withFuel ? KIND_ORDER : KIND_ORDER.filter((k) => k !== "fuel");
  const periods: [Period, string][] = [["12m", "12 months"], ["year", "This year"], ["all", "All time"], ...years.map((y) => [y as Period, y] as [Period, string])];
  const topCategory = s.byCategory[0]?.total || 1;

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {periods.map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1 text-sm",
              period === p ? "border-foreground/30 bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">Total spent</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={withFuel} onChange={(e) => setWithFuel(e.target.checked)} className="accent-primary" />
            Include fuel
          </label>
        </div>
        <p className="mt-1 font-heading text-4xl font-semibold tabular-nums">{money(s.total)}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Metric label="Per km" value={s.costPerKm != null ? money(s.costPerKm, 2) : "–"} />
          <Metric label="Driven" value={s.distance ? km(s.distance) : "–"} />
          <Metric label="Economy" value={economy ? `${num(economy, 1)} km/L` : "–"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {kinds.map((k) => (
          <div key={k} className="rounded-2xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: KINDS[k].color }} /> {KINDS[k].plural}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{money(s.byKind[k], 0)}</p>
            <p className="text-xs text-muted-foreground">{s.total ? Math.round((s.byKind[k] / s.total) * 100) : 0}% of total</p>
          </div>
        ))}
      </div>

      {s.byMonth.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Spending per month</h2>
          <MonthChart months={fillMonths(s.byMonth)} kinds={kinds} />
        </div>
      )}

      {s.byCategory.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Where the money goes</h2>
          {(s.partsTotal > 0 || s.laborTotal > 0) && (
            <p className="mb-3 text-xs text-muted-foreground">
              Itemized jobs: parts {money(s.partsTotal, 0)} · labor {money(s.laborTotal, 0)}
            </p>
          )}
          <div className="space-y-3">
            {s.byCategory.map((c) => (
              <div key={`${c.kind}:${c.category}`} className="flex items-center gap-3">
                <KindIcon entry={c} className="size-9" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">
                      {categoryOf(c.kind, c.category)?.label ?? KINDS[c.kind].label}
                      <span className="text-muted-foreground"> · {c.count}×</span>
                    </span>
                    <span className="font-medium tabular-nums">{money(c.total, 0)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${(c.total / topCategory) * 100}%`, background: KINDS[c.kind].color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vehicle.purchase_price != null && period === "all" && (
        <div className="rounded-2xl border bg-card p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Purchase price</span><span className="tabular-nums">{money(vehicle.purchase_price, 0)}</span></div>
          <div className="mt-1 flex justify-between font-semibold"><span>Total cost of ownership</span><span className="tabular-nums">{money(vehicle.purchase_price + s.total, 0)}</span></div>
        </div>
      )}

      {s.count === 0 && <EmptyState icon={BarChart3} title="Nothing logged in this period" />}

      <Button variant="outline" className="w-full" asChild>
        <Link to="/report"><FileText /> Full report · PDF & CSV</Link>
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
