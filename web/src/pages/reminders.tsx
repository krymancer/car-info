import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, BellPlus, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Reminder } from "@/lib/api";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { date, km, num, parseNum, today } from "@/lib/format";
import { useCurrentVehicle, useEntries, useReminders } from "@/lib/hooks";
import { currentOdometer, reminderStatus, type ReminderStatus } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { EmptyState, Fab } from "@/components/shell";
import { KindIcon } from "@/components/entry-row";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const STATE = {
  overdue: { label: "Overdue", icon: AlertTriangle, bar: "bg-destructive", text: "text-destructive" },
  soon: { label: "Due soon", icon: Clock, bar: "bg-amber-500", text: "text-amber-400" },
  ok: { label: "OK", icon: CheckCircle2, bar: "bg-emerald-500", text: "text-emerald-400" },
  unknown: { label: "No baseline", icon: Clock, bar: "bg-muted-foreground", text: "text-muted-foreground" },
} as const;

function dueText(s: ReminderStatus) {
  const parts: string[] = [];
  if (s.kmLeft != null) parts.push(s.kmLeft >= 0 ? `${num(s.kmLeft)} km left` : `${num(-s.kmLeft)} km over`);
  if (s.daysLeft != null) {
    const d = Math.abs(s.daysLeft);
    const span = d >= 60 ? `${Math.round(d / 30)} months` : `${d} days`;
    parts.push(s.daysLeft >= 0 ? `${span} left` : `${span} late`);
  }
  return parts.join(" · ") || "Set when it was last done";
}

export function RemindersPage() {
  const { vehicle, isLoading } = useCurrentVehicle();
  const reminders = useReminders(vehicle?.id);
  const entries = useEntries(vehicle?.id);
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);

  const odo = useMemo(
    () => currentOdometer(entries.data ?? [], vehicle?.purchase_odometer),
    [entries.data, vehicle?.purchase_odometer],
  );
  const rows = useMemo(
    () =>
      (reminders.data ?? [])
        .map((r) => ({ r, s: reminderStatus(r, odo, today()) }))
        .sort((a, b) => b.s.progress - a.s.progress),
    [reminders.data, odo],
  );

  if (isLoading || reminders.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!vehicle) return <EmptyState icon={Bell} title="Add a vehicle first" />;

  return (
    <div className="space-y-3">
      {odo != null && <p className="px-1 text-sm text-muted-foreground">Current odometer: {km(odo)}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="No reminders">
          Track timing belts, oil changes, insurance renewals by km or time. Logging a service in the same category
          resets the reminder automatically.
        </EmptyState>
      ) : (
        rows.map(({ r, s }) => {
          const st = STATE[s.state];
          return (
            <button
              key={r.id}
              onClick={() => setEditing(r)}
              className="w-full space-y-3 rounded-2xl border bg-card p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <KindIcon entry={{ kind: "service", category: r.category }} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Every {[r.interval_km && km(r.interval_km), r.interval_months && `${r.interval_months} months`]
                      .filter(Boolean)
                      .join(" or ")}
                  </p>
                </div>
                <span className={cn("flex items-center gap-1 text-xs font-medium", st.text)}>
                  <st.icon className="size-3.5" /> {st.label}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full", st.bar)} style={{ width: `${Math.min(100, s.progress * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{dueText(s)}</span>
                <span className="tabular-nums">
                  {[s.dueDate && date(s.dueDate), s.dueKm != null && km(s.dueKm)].filter(Boolean).join(" · ")}
                </span>
              </div>
            </button>
          );
        })
      )}
      <Fab onClick={() => setEditing("new")} label="Reminder" icon={BellPlus} />
      {editing && (
        <ReminderSheet
          vehicleId={vehicle.id}
          reminder={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ReminderSheet({ vehicleId, reminder, onClose }: { vehicleId: string; reminder: Reminder | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [category, setCategory] = useState(reminder?.category ?? "none");
  const [intervalKm, setIntervalKm] = useState(reminder?.interval_km?.toString() ?? "");
  const [intervalMonths, setIntervalMonths] = useState(reminder?.interval_months?.toString() ?? "");
  const [lastDate, setLastDate] = useState(reminder?.last_date ?? "");
  const [lastOdo, setLastOdo] = useState(reminder?.last_odometer?.toString() ?? "");

  const done = () => {
    void qc.invalidateQueries({ queryKey: ["reminders"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        vehicle_id: vehicleId,
        title: title || categoryOf("service", category)?.label,
        category: category === "none" ? null : category,
        interval_km: intervalKm || null,
        interval_months: parseNum(intervalMonths),
        last_date: lastDate || null,
        last_odometer: lastOdo || null,
      };
      return reminder
        ? api(`/reminders/${reminder.id}`, { method: "PATCH", body })
        : api("/reminders", { method: "POST", body });
    },
    onSuccess: done,
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({ mutationFn: () => api(`/reminders/${reminder!.id}`, { method: "DELETE" }), onSuccess: done });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{reminder ? "Edit reminder" : "New reminder"}</SheetTitle></SheetHeader>
        <form
          className="space-y-4 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Linked service</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (manual only)</SelectItem>
                {CATEGORIES.service.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Logging this service resets the reminder.</p>
          </div>
          <Field label="Title" value={title} onChange={setTitle} placeholder={categoryOf("service", category)?.label ?? "e.g. Insurance renewal"} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Every" integer suffix="km" value={intervalKm} onChange={setIntervalKm} />
            <Field label="or every" integer suffix="months" value={intervalMonths} onChange={setIntervalMonths} />
          </div>
          <p className="text-xs text-muted-foreground">Last done (if not logged in the app):</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" type="date" value={lastDate} onChange={setLastDate} />
            <Field label="Odometer" integer suffix="km" value={lastOdo} onChange={setLastOdo} />
          </div>
          <button type="submit" hidden />
        </form>
        <SheetFooter className="flex-row gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {reminder && (
            <Button variant="destructive" size="icon-lg" aria-label="Delete reminder" onClick={() => remove.mutate()}>
              <Trash2 />
            </Button>
          )}
          <Button className="h-9 flex-1" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
