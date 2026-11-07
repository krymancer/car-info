import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Entry, type Kind } from "@/lib/api";
import { createEntry } from "@/lib/outbox";
import { FUEL_TYPES, KINDS, KIND_ORDER } from "@/lib/categories";
import { km, money, parseNum, parseWhole, today } from "@/lib/format";
import { useCurrentVehicle, useEntries, useGoBack } from "@/lib/hooks";
import { currentOdometer } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { FormScreen } from "@/components/shell";
import { Attachments, uploadFile } from "@/components/attachments";
import { CategoryPicker } from "@/components/category-picker";
import { Field, Section } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ItemDraft = { key: number; name: string; brand: string; part_number: string; qty: string; unit_price: string };
type FuelField = "total" | "fuel_price" | "fuel_liters";

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
let itemKey = 0;
const blankItem = (): ItemDraft => ({ key: ++itemKey, name: "", brand: "", part_number: "", qty: "1", unit_price: "" });

export function EntryFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const goBack = useGoBack();
  const qc = useQueryClient();
  const { vehicle, vehicles } = useCurrentVehicle();
  const existing = useQuery({ queryKey: ["entry", id], queryFn: () => api<Entry>(`/entries/${id}`), enabled: !!id });
  const [pickedVehicle, setPickedVehicle] = useState<string | null>(null);
  const vehicleId = existing.data?.vehicle_id ?? pickedVehicle ?? vehicle?.id;
  const active = vehicles.filter((v) => !v.archived);
  const entries = useEntries(vehicleId);
  const lastOdo = useMemo(() => currentOdometer(entries.data ?? []), [entries.data]);
  const lastFuel = useMemo(() => entries.data?.find((e) => e.kind === "fuel" && e.fuel_price), [entries.data]);

  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) ?? "service");
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [odometer, setOdometer] = useState("");
  const [total, setTotal] = useState("");
  const [labor, setLabor] = useState("");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [fuelType, setFuelType] = useState(vehicle?.fuel_type ?? "Regular");
  const [fullTank, setFullTank] = useState(true);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const fuelEdits = useRef<FuelField[]>([]);

  // New fill-up: start from the last price paid, so typing the total is enough to get the liters.
  const prefilledFor = useRef<string | null>(null);
  const priceTyped = useRef(false);
  useEffect(() => {
    if (id || kind !== "fuel" || !vehicleId || entries.isLoading || prefilledFor.current === vehicleId) return;
    prefilledFor.current = vehicleId;
    if (priceTyped.current) return;
    setPrice(lastFuel?.fuel_price ? String(lastFuel.fuel_price) : "");
    setFuelType(lastFuel?.fuel_type ?? vehicles.find((v) => v.id === vehicleId)?.fuel_type ?? "Regular");
    fuelEdits.current = lastFuel?.fuel_price ? ["fuel_price"] : [];
  }, [id, kind, vehicleId, entries.isLoading, lastFuel, vehicles]);

  // Load the entry being edited once.
  const loaded = useRef(false);
  useEffect(() => {
    const e = existing.data;
    if (!e || loaded.current) return;
    loaded.current = true;
    setKind(e.kind);
    setCategory(e.category);
    setTitle(e.title ?? "");
    setDate(e.date);
    setOdometer(str(e.odometer));
    setTotal(str(e.total));
    setLabor(str(e.labor));
    setShop(e.shop ?? "");
    setNotes(e.notes ?? "");
    setLiters(str(e.fuel_liters));
    setPrice(str(e.fuel_price));
    setFuelType(e.fuel_type ?? "Regular");
    setFullTank(!!e.full_tank);
    setItems(
      e.items.map((i) => ({
        key: ++itemKey,
        name: i.name,
        brand: i.brand ?? "",
        part_number: i.part_number ?? "",
        qty: str(i.qty),
        unit_price: str(i.unit_price),
      })),
    );
  }, [existing.data]);

  // Fuel: whichever two of total / price / liters were edited last determine the third.
  const editFuel = (field: FuelField, value: string) => {
    if (field === "fuel_price") priceTyped.current = true;
    const values = { total, fuel_price: price, fuel_liters: liters, [field]: value };
    fuelEdits.current = [field, ...fuelEdits.current.filter((f) => f !== field)].slice(0, 2);
    const [a, b] = fuelEdits.current;
    const derived = (["total", "fuel_price", "fuel_liters"] as FuelField[]).find((f) => f !== a && f !== b);
    const t = parseNum(values.total), p = parseNum(values.fuel_price), l = parseNum(values.fuel_liters);
    if (b && derived === "total" && p && l) values.total = (p * l).toFixed(2);
    if (b && derived === "fuel_liters" && t && p) values.fuel_liters = (t / p).toFixed(2);
    if (b && derived === "fuel_price" && t && l) values.fuel_price = (t / l).toFixed(3);
    setTotal(values.total);
    setPrice(values.fuel_price);
    setLiters(values.fuel_liters);
  };

  const hasParts = kind !== "fuel" && kind !== "expense" && items.length > 0;
  const partsSum = items.reduce((s, i) => s + (parseNum(i.qty) ?? 0) * (parseNum(i.unit_price) ?? 0), 0);
  const computedTotal = hasParts ? partsSum + (parseNum(labor) ?? 0) : parseNum(total) ?? 0;

  const invalidate = () =>
    Promise.all(["entries", "vehicles", "reminders", "entry"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const save = useMutation({
    mutationFn: async () => {
      if (!vehicleId) throw new Error("Add a vehicle first");
      if (kind !== "fuel" && !category) throw new Error("Pick a category");
      const named = items.filter((i) => i.name.trim());
      const body = {
        vehicle_id: vehicleId,
        kind,
        category: kind === "fuel" ? null : category,
        title,
        date,
        odometer: parseWhole(odometer),
        total: hasParts ? computedTotal : parseNum(total),
        labor: kind === "service" || kind === "upgrade" ? parseNum(labor) : null,
        shop,
        notes,
        fuel_liters: kind === "fuel" ? parseNum(liters) : null,
        fuel_price: kind === "fuel" ? parseNum(price) : null,
        fuel_type: kind === "fuel" ? fuelType : null,
        full_tank: kind === "fuel" ? fullTank : null,
        items:
          kind === "service" || kind === "upgrade"
            ? named.map((i) => ({
                name: i.name,
                brand: i.brand,
                part_number: i.part_number,
                qty: parseNum(i.qty) ?? 1,
                unit_price: parseNum(i.unit_price) ?? 0,
              }))
            : [],
      };
      if (id) return api<Entry>(`/entries/${id}`, { method: "PATCH", body }).then(() => "saved" as const);
      const created = await createEntry(body);
      if (!created) return "queued" as const;
      for (const f of files) await uploadFile({ entry_id: created.id }, f);
      return "saved" as const;
    },
    onSuccess: async (result) => {
      if (result === "queued") {
        toast.success("Saved on this device", {
          description: `The server is unreachable; it syncs automatically later.${files.length ? " Attach the receipts again then." : ""}`,
        });
      } else {
        await invalidate();
        toast.success(id ? "Saved" : "Added");
      }
      goBack();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => api(`/entries/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Deleted");
      goBack();
    },
  });

  const updateItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <FormScreen
      title={`${id ? "Edit" : "New"} ${KINDS[kind].label.toLowerCase()}`}
      onClose={() => goBack()}
      onSave={() => save.mutate()}
      saving={save.isPending}
    >
      {!id && active.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {active.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setPickedVehicle(v.id)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                v.id === vehicleId ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
              )}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {!id && (
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-card p-1">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCategory(null);
              }}
              className={cn(
                "rounded-lg py-2 text-xs font-medium text-muted-foreground",
                kind === k && "bg-secondary text-foreground",
              )}
            >
              {KINDS[k].label}
            </button>
          ))}
        </div>
      )}

      {kind !== "fuel" && (
        <CategoryPicker kind={kind} value={category} onChange={setCategory} />
      )}

      <Section>
        {kind !== "fuel" && (
          <Field
            label="Description"
            placeholder={kind === "upgrade" ? "e.g. LED headlights" : kind === "expense" ? "e.g. IPVA 2026" : "e.g. 60k km service"}
            value={title}
            onChange={setTitle}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={date} onChange={setDate} />
          <Field
            label="Odometer"
            integer
            suffix="km"
            value={odometer}
            onChange={setOdometer}
            placeholder={lastOdo != null ? String(lastOdo) : ""}
            hint={lastOdo != null && `Last: ${km(lastOdo)}`}
          />
        </div>
      </Section>

      {kind === "fuel" && (
        <Section title="Fuel">
          <Field label="Total cost" numeric value={total} onChange={(v) => editFuel("total", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price per liter" numeric value={price} onChange={(v) => editFuel("fuel_price", v)} />
            <Field label="Volume" numeric suffix="L" value={liters} onChange={(v) => editFuel("fuel_liters", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Fuel type</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Full tank
              <span className="block text-xs text-muted-foreground">Needed to calculate fuel economy</span>
            </span>
            <Switch checked={fullTank} onCheckedChange={setFullTank} />
          </label>
        </Section>
      )}

      {(kind === "service" || kind === "upgrade") && (
        <Section
          title="Parts"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, blankItem()])}>
              <Plus /> Add part
            </Button>
          }
        >
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              List each part to track brands, part numbers and prices. Or just enter the total below.
            </p>
          )}
          {items.map((it) => (
            <div
              key={it.key}
              className="space-y-3 rounded-xl border p-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_7rem_auto] lg:items-end lg:gap-3 lg:space-y-0"
            >
              <div className="flex items-end gap-2 lg:contents">
                <Field label="Part" className="flex-1" placeholder="e.g. Oil filter" value={it.name} onChange={(v) => updateItem(it.key, { name: v })} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-1 lg:order-last lg:mb-0.5"
                  aria-label="Remove part"
                  onClick={() => setItems((l) => l.filter((i) => i.key !== it.key))}
                >
                  <X />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:contents">
                <Field label="Brand" value={it.brand} onChange={(v) => updateItem(it.key, { brand: v })} />
                <Field label="Part number" value={it.part_number} onChange={(v) => updateItem(it.key, { part_number: v })} />
                <Field label="Qty" numeric value={it.qty} onChange={(v) => updateItem(it.key, { qty: v })} />
                <Field label="Unit price" numeric value={it.unit_price} onChange={(v) => updateItem(it.key, { unit_price: v })} />
              </div>
            </div>
          ))}
          {items.length > 0 && <Field label="Labor" numeric value={labor} onChange={setLabor} />}
        </Section>
      )}

      {kind !== "fuel" && (
        <Section>
          {hasParts ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                Total · parts {money(partsSum)} + labor {money(parseNum(labor) ?? 0)}
              </span>
              <span className="text-lg font-semibold tabular-nums">{money(computedTotal)}</span>
            </div>
          ) : (
            <Field label="Total cost" numeric value={total} onChange={setTotal} />
          )}
        </Section>
      )}

      <Section>
        <Field
          label={kind === "fuel" ? "Gas station" : kind === "expense" ? "Paid to" : "Shop / mechanic"}
          value={shop}
          onChange={setShop}
        />
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Section>

      <Section title={kind === "expense" ? "Receipts & documents" : "Receipts"}>
        {id ? <Attachments entryId={id} /> : <Attachments pending={files} onPendingChange={setFiles} />}
      </Section>

      {id && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" className="w-full"><Trash2 /> Delete record</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </FormScreen>
  );
}

