import { Link } from "react-router";
import { Bike, CarFront, Plus, Truck } from "lucide-react";
import type { Vehicle } from "@/lib/api";
import { km } from "@/lib/format";
import { selectVehicle, useCurrentVehicle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, Fab } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const VEHICLE_ICONS: Record<Vehicle["type"], React.ElementType> = {
  car: CarFront,
  motorcycle: Bike,
  truck: Truck,
  other: CarFront,
};

export function GaragePage() {
  const { vehicle: current, vehicles, isLoading } = useCurrentVehicle();
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      {vehicles.length === 0 && <EmptyState icon={CarFront} title="Your garage is empty" />}
      {vehicles.map((v) => {
        const Icon = VEHICLE_ICONS[v.type] ?? CarFront;
        const subtitle = [v.make, v.model, v.year].filter(Boolean).join(" ");
        return (
          <div
            key={v.id}
            className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3", v.archived && "opacity-60")}
          >
            <button onClick={() => selectVehicle(v.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className={cn("flex size-14 items-center justify-center rounded-xl bg-secondary", v.id === current?.id && "ring-2 ring-primary")}>
                <Icon className="size-7" />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  {v.name}
                  {v.archived ? <Badge variant="secondary">Sold</Badge> : null}
                </p>
                {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                <p className="text-xs text-muted-foreground">
                  {[v.plate, v.last_odometer != null && km(v.last_odometer)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
            <Link to={`/garage/${v.id}`} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
              Edit
            </Link>
          </div>
        );
      })}
      <Fab to="/garage/new" label="Vehicle" icon={Plus} />
    </div>
  );
}
