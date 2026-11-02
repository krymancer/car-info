import { useState } from "react";
import type { Kind } from "@/lib/api";
import { KINDS, KIND_ORDER } from "@/lib/categories";
import { money, monthLabel } from "@/lib/format";
import type { KindTotals } from "@/lib/stats";
import { cn } from "@/lib/utils";

/** Stacked monthly spend by kind. Tap/hover a column for the breakdown. */
export function MonthChart({ months, kinds }: { months: [string, KindTotals][]; kinds: Kind[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const shown = KIND_ORDER.filter((k) => kinds.includes(k));
  const totals = months.map(([, t]) => shown.reduce((s, k) => s + t[k], 0));
  const max = niceMax(Math.max(...totals, 1));
  const focus = active ?? months.length - 1;
  const [ym, t] = months[focus] ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {shown.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: KINDS[k].color }} /> {KINDS[k].plural}
          </span>
        ))}
        <button className="ml-auto underline-offset-2 hover:underline" onClick={() => setTable((v) => !v)}>
          {table ? "Chart" : "Table"}
        </button>
      </div>

      {table ? (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="py-1 text-left font-normal">Month</th>{shown.map((k) => <th key={k} className="text-right font-normal">{KINDS[k].plural}</th>)}<th className="text-right font-normal">Total</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {[...months].reverse().map(([m, row], i) => (
              <tr key={m} className="border-t">
                <td className="py-1.5 capitalize">{monthLabel(m, false)} {m.slice(2, 4)}</td>
                {shown.map((k) => <td key={k} className="text-right">{row[k] ? money(row[k], 0) : "–"}</td>)}
                <td className="text-right font-medium">{money(totals[months.length - 1 - i], 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="flex min-h-12 items-start justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
            {ym && t ? (
              <>
                <div>
                  <p className="font-medium capitalize text-foreground">{monthLabel(ym)}</p>
                  <p className="text-muted-foreground">
                    {shown.filter((k) => t[k]).map((k) => `${KINDS[k].plural} ${money(t[k], 0)}`).join(" · ") || "No spending"}
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-foreground">{money(totals[focus], 0)}</p>
              </>
            ) : null}
          </div>
          <div className="relative h-44" onMouseLeave={() => setActive(null)}>
            {[1, 0.5].map((f) => (
              <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ bottom: `${f * 100}%` }}>
                <span className="absolute -top-2 left-0 bg-card pr-1 text-[10px] text-muted-foreground">{money(max * f, 0)}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px] border-b border-border pl-10">
              {months.map(([m, row], i) => (
                <button
                  key={m}
                  aria-label={`${monthLabel(m)}: ${money(totals[i])}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={cn("flex h-full min-w-0 flex-1 flex-col-reverse gap-[2px]", focus === i ? "opacity-100" : "opacity-75 hover:opacity-100")}
                >
                  {shown.filter((k) => row[k] > 0).map((k, j, arr) => (
                    <div
                      key={k}
                      className={cn("w-full", j === arr.length - 1 && "rounded-t-[4px]")}
                      style={{ height: `${(row[k] / max) * 100}%`, background: KINDS[k].color }}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between pl-10 text-[10px] text-muted-foreground capitalize">
            <span>{months[0] && `${monthLabel(months[0][0], false)} ${months[0][0].slice(2, 4)}`}</span>
            <span>{months.length > 1 && `${monthLabel(months[months.length - 1][0], false)} ${months[months.length - 1][0].slice(2, 4)}`}</span>
          </div>
        </>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}
