import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import type { Entry, Kind } from "@/lib/api";
import { saveBlob } from "@/lib/api";
import { KINDS, KIND_ORDER, categoryOf, entryLabel } from "@/lib/categories";
import { entriesCsv } from "@/lib/csv";
import { date, getSettings, km, money, monthLabel, num } from "@/lib/format";
import { useAllEntries, useVehicles, useGoBack } from "@/lib/hooks";
import { fuelEconomy, summarize } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "all";

/** Printable spending report (use the browser's "Save as PDF") plus a CSV of the same records. */
export function ReportPage() {
  const goBack = useGoBack();
  const vehicles = useVehicles();
  const entries = useAllEntries();
  const [vehicleId, setVehicleId] = useState(ALL);
  const [year, setYear] = useState(ALL);

  const all = entries.data ?? [];
  const list = vehicles.data ?? [];
  const years = useMemo(() => [...new Set(all.map((e) => e.date.slice(0, 4)))].sort().reverse(), [all]);
  const scoped = useMemo(
    () => all.filter((e) => (vehicleId === ALL || e.vehicle_id === vehicleId) && (year === ALL || e.date.startsWith(year))),
    [all, vehicleId, year],
  );
  const s = useMemo(() => summarize(scoped), [scoped]);
  const vehicle = list.find((v) => v.id === vehicleId);

  if (entries.isLoading || vehicles.isLoading) return <div className="p-4"><Skeleton className="h-60 w-full" /></div>;

  const scope = [vehicle?.name ?? "All vehicles", year === ALL ? "all time" : year].join(" · ");
  const csv = () => {
    const name = `car-info-${(vehicle?.name ?? "all").toLowerCase().replace(/\W+/g, "-")}-${year}.csv`;
    saveBlob(new Blob([entriesCsv(scoped, list, getSettings().locale)], { type: "text/csv;charset=utf-8" }), name);
  };
  const perVehicle = list
    .map((v) => ({ v, s: summarize(scoped.filter((e) => e.vehicle_id === v.id)) }))
    .filter((r) => r.s.count > 0);
  const economy = vehicle ? fuelEconomy(scoped).average : null;
  const sorted = [...scoped].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mx-auto min-h-dvh max-w-4xl lg:max-w-6xl lg:px-4 print:max-w-none">
      <PageHeader title="Report" onBack={() => goBack()}>
        <Button variant="outline" size="sm" onClick={csv} disabled={!scoped.length}><FileSpreadsheet /> CSV</Button>
        <Button size="sm" onClick={() => print()} disabled={!scoped.length}><Printer /> PDF</Button>
      </PageHeader>

      <div className="space-y-6 p-4">
        <div className="grid grid-cols-2 gap-3 lg:w-md print:hidden">
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All vehicles</SelectItem>
              {list.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All time</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Car Info report · {scope}</p>
          <p className="font-heading text-4xl font-semibold tabular-nums">{money(s.total)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.count} records
            {vehicle && s.distance > 0 && <> · {km(s.distance)} driven · {money(s.costPerKm, 2)}/km</>}
            {economy && <> · {num(economy, 1)} km/L</>}
          </p>
        </div>

        <ReportTable
          title="By type"
          head={["", "Records", "Total", "Share"]}
          rows={KIND_ORDER.filter((k) => s.byKind[k] > 0).map((k) => [
            KINDS[k].plural,
            String(scoped.filter((e) => e.kind === k).length),
            money(s.byKind[k]),
            `${Math.round((s.byKind[k] / (s.total || 1)) * 100)}%`,
          ])}
          foot={["Total", String(s.count), money(s.total), ""]}
        />

        {!vehicle && perVehicle.length > 1 && (
          <ReportTable
            title="By vehicle"
            head={["", ...KIND_ORDER.map((k) => KINDS[k].plural), "Total"]}
            rows={perVehicle.map(({ v, s: vs }) => [v.name, ...KIND_ORDER.map((k) => money(vs.byKind[k], 0)), money(vs.total)])}
          />
        )}

        <ReportTable
          title="By category"
          head={["", "Type", "Records", "Total"]}
          rows={s.byCategory.map((c) => [
            categoryOf(c.kind, c.category)?.label ?? KINDS[c.kind].label,
            KINDS[c.kind].label,
            String(c.count),
            money(c.total),
          ])}
        />

        {(s.partsTotal > 0 || s.laborTotal > 0) && (
          <p className="text-sm text-muted-foreground">
            Itemized jobs: parts {money(s.partsTotal)} · labor {money(s.laborTotal)}
          </p>
        )}

        <ReportTable
          title="By month"
          head={["", ...KIND_ORDER.map((k) => KINDS[k].plural), "Total"]}
          rows={s.byMonth.map(([ym, t]) => [
            monthLabel(ym),
            ...KIND_ORDER.map((k) => (t[k] ? money(t[k], 0) : "–")),
            money(KIND_ORDER.reduce((sum, k) => sum + t[k], 0)),
          ])}
        />

        <section className="space-y-2 print:break-before-page">
          <h2 className="text-sm font-semibold">All records</h2>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {!vehicle && <TableHead>Vehicle</TableHead>}
                  <TableHead>Record</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e) => (
                  <TableRow key={e.id} className="break-inside-avoid">
                    <TableCell className="whitespace-nowrap">{date(e.date)}</TableCell>
                    {!vehicle && <TableCell>{list.find((v) => v.id === e.vehicle_id)?.name}</TableCell>}
                    <TableCell className="whitespace-normal">
                      <RecordCell e={e} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.odometer != null ? num(e.odometer) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(e.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}

function RecordCell({ e }: { e: Entry }) {
  const kind: Kind = e.kind;
  const sub =
    kind === "fuel"
      ? [e.fuel_liters && `${num(e.fuel_liters, 2)} L`, e.fuel_price && `${money(e.fuel_price, 2)}/L`, e.shop]
      : [e.items.map((i) => i.name).join(", "), e.shop];
  const detail = sub.filter(Boolean).join(" · ");
  return (
    <>
      <span>{entryLabel(e)}</span>
      {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
    </>
  );
}

function ReportTable({ title, head, rows, foot }: { title: string; head: string[]; rows: string[][]; foot?: string[] }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2 break-inside-avoid">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((h, i) => <TableHead key={i} className={i ? "text-right" : ""}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => <TableCell key={j} className={j ? "text-right tabular-nums" : ""}>{c}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
          {foot && (
            <TableFooter>
              <TableRow>
                {foot.map((c, j) => <TableCell key={j} className={j ? "text-right tabular-nums" : ""}>{c}</TableCell>)}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </section>
  );
}
