import { Bell, BarChart3, CarFront, ListOrdered, Settings } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { selectVehicle, useCurrentVehicle } from "@/lib/hooks";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Log", icon: ListOrdered, end: true },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/garage", label: "Garage", icon: CarFront },
];

export function Shell() {
  const { vehicle, vehicles } = useCurrentVehicle();
  const onGarage = useLocation().pathname === "/garage";
  const active = vehicles.filter((v) => !v.archived);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="font-heading text-lg font-semibold">Car Info</h1>
          <Button variant="ghost" size="icon" asChild>
            <Link to="/settings" aria-label="Settings"><Settings /></Link>
          </Button>
        </div>
        {!onGarage && active.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {active.map((v) => (
              <button
                key={v.id}
                onClick={() => selectVehicle(v.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  v.id === vehicle?.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground transition-colors",
                  isActive && "text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("rounded-full px-4 py-1", isActive && "bg-secondary")}>
                    <n.icon className="size-5" />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Full-screen form chrome: close on the left, title, save on the right. */
export function FormScreen({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <h1 className="flex-1 truncate text-center font-heading font-semibold">{title}</h1>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </header>
      <form
        className="flex-1 space-y-4 p-4 pb-16"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {children}
        <button type="submit" hidden />
      </form>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl bg-secondary p-4"><Icon className="size-7 text-muted-foreground" /></div>
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

const fabClass =
  "fixed right-[max(1rem,calc(50%-21rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-2xl bg-primary px-5 py-4 font-medium text-primary-foreground shadow-lg shadow-black/40 transition-transform active:scale-95";

export function Fab({ to, onClick, label, icon: Icon }: { to?: string; onClick?: () => void; label: string; icon: React.ElementType }) {
  const content = <><Icon className="size-5" /> {label}</>;
  return to ? <Link to={to} className={fabClass}>{content}</Link> : <button onClick={onClick} className={fabClass}>{content}</button>;
}
