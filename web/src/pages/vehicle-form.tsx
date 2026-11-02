import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Vehicle } from "@/lib/api";
import { FUEL_TYPES } from "@/lib/categories";
import { parseNum } from "@/lib/format";
import { selectVehicle, useGoBack } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { FormScreen } from "@/components/shell";
import { Attachments } from "@/components/attachments";
import { Field, Section } from "@/components/field";
import { VEHICLE_ICONS } from "@/pages/garage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const TYPES: [Vehicle["type"], string][] = [["car", "Car"], ["motorcycle", "Motorcycle"], ["truck", "Truck"], ["other", "Other"]];
const TEXT = ["name", "make", "model", "year", "plate", "vin", "purchase_date", "purchase_price", "purchase_odometer", "tank_capacity", "notes"] as const;
type Form = Record<(typeof TEXT)[number], string>;

export function VehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["vehicle", id], queryFn: () => api<Vehicle>(`/vehicles/${id}`), enabled: !!id });
  const [form, setForm] = useState<Form>(() => Object.fromEntries(TEXT.map((k) => [k, ""])) as Form);
  const [type, setType] = useState<Vehicle["type"]>("car");
  const [fuelType, setFuelType] = useState("Regular");
  const [archived, setArchived] = useState(false);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const loaded = useRef(false);
  useEffect(() => {
    const v = existing.data;
    if (!v || loaded.current) return;
    loaded.current = true;
    setForm(Object.fromEntries(TEXT.map((k) => [k, v[k] == null ? "" : String(v[k])])) as Form);
    setType(v.type);
    setFuelType(v.fuel_type ?? "Regular");
    setArchived(!!v.archived);
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        purchase_price: parseNum(form.purchase_price),
        tank_capacity: parseNum(form.tank_capacity),
        type,
        fuel_type: fuelType,
        archived,
      };
      return id
        ? api<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body })
        : api<Vehicle>("/vehicles", { method: "POST", body });
    },
    onSuccess: async (v) => {
      await qc.invalidateQueries({ queryKey: ["vehicles"] });
      await qc.invalidateQueries({ queryKey: ["vehicle"] });
      if (!id) selectVehicle(v.id);
      goBack();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate("/garage", { replace: true });
    },
  });

  return (
    <FormScreen title={id ? "Edit vehicle" : "New vehicle"} onClose={() => goBack()} onSave={() => save.mutate()} saving={save.isPending}>
      <div className="grid grid-cols-4 gap-2">
        {TYPES.map(([t, label]) => {
          const Icon = VEHICLE_ICONS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn("flex flex-col items-center gap-1 rounded-xl border bg-card py-3 text-xs text-muted-foreground", type === t && "border-foreground/40 text-foreground")}
            >
              <Icon className="size-6" /> {label}
            </button>
          );
        })}
      </div>
      <Section>
        <Field label="Name" placeholder="e.g. Civic" value={form.name} onChange={set("name")} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make" placeholder="Honda" value={form.make} onChange={set("make")} />
          <Field label="Model" placeholder="Civic LX 1.6" value={form.model} onChange={set("model")} />
          <Field label="Year" integer value={form.year} onChange={set("year")} />
          <Field label="Plate" value={form.plate} onChange={(v) => set("plate")(v.toUpperCase())} />
        </div>
        <Field label="VIN / chassis" value={form.vin} onChange={set("vin")} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Fuel</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Tank" numeric suffix="L" value={form.tank_capacity} onChange={set("tank_capacity")} />
        </div>
      </Section>
      <Section title="Purchase">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={form.purchase_date} onChange={set("purchase_date")} />
          <Field label="Price" numeric value={form.purchase_price} onChange={set("purchase_price")} />
        </div>
        <Field label="Odometer at purchase" integer suffix="km" value={form.purchase_odometer} onChange={set("purchase_odometer")} />
      </Section>
      <Section>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </div>
        {id && (
          <label className="flex items-center justify-between">
            <span className="text-sm">Sold / archived<span className="block text-xs text-muted-foreground">Hidden from the vehicle switcher, history kept</span></span>
            <Switch checked={archived} onCheckedChange={setArchived} />
          </label>
        )}
      </Section>
      {id && (
        <Section title="Documents">
          <p className="text-sm text-muted-foreground">Registration (CRLV), insurance policy, manual, purchase papers.</p>
          <Attachments vehicleId={id} />
        </Section>
      )}
      {id && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" className="w-full"><Trash2 /> Delete vehicle</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {form.name}?</AlertDialogTitle>
              <AlertDialogDescription>All of its records and reminders are deleted too. Consider archiving instead.</AlertDialogDescription>
            </AlertDialogHeader>
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
