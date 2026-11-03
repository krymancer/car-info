import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bell, BarChart3, CarFront, FileText, ListOrdered, Plus, Settings } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { KINDS, KIND_HINT, KIND_ORDER } from "@/lib/categories";
import { km } from "@/lib/format";
import { cn } from "@/lib/utils";
import { selectVehicle, useCurrentVehicle } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/", label: "Log", icon: ListOrdered, end: true },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/garage", label: "Garage", icon: CarFront },
];

/** Wraps every signed-in page. On laptop-sized screens it adds a sidebar; phones get the tab bar from `Shell`. */
export function AppLayout() {
  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      <Sidebar />
      <Outlet />
    </div>
  );
}

function Sidebar() {
  const { vehicle, vehicles } = useCurrentVehicle();
  const active = vehicles.filter((v) => !v.archived);
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
      isActive && "bg-secondary text-foreground",
    );

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/40 lg:flex print:hidden">
      <div className="flex h-16 items-center px-5">
        <Link to="/" className="font-heading text-lg font-semibold">Car Info</Link>
      </div>
      <div className="px-3">
        <AddRecordMenu>
          <Button className="w-full justify-start"><Plus /> New record</Button>
        </AddRecordMenu>
      </div>

      {active.length > 0 && (
        <div className="mt-6 px-3">
          <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">Vehicles</p>
          {active.map((v) => (
            <button
              key={v.id}
              onClick={() => selectVehicle(v.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60",
                v.id === vehicle?.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", v.id === vehicle?.id ? "bg-primary" : "bg-border")} />
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.last_odometer != null && <span className="text-xs text-muted-foreground tabular-nums">{km(v.last_odometer)}</span>}
            </button>
          ))}
        </div>
      )}

      <nav className="mt-6 space-y-0.5 px-3">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={link}>
            <n.icon className="size-4" /> {n.label}
          </NavLink>
        ))}
        <NavLink to="/report" className={link}><FileText className="size-4" /> Report</NavLink>
      </nav>

      <div className="mt-auto p-3">
        <NavLink to="/settings" className={link}><Settings className="size-4" /> Settings</NavLink>
      </div>
    </aside>
  );
}

/** Dropdown of record kinds; opens the matching form. */
export function AddRecordMenu({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {KIND_ORDER.map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <DropdownMenuItem key={k} onSelect={() => navigate(`/entry/new?kind=${k}`)} className="gap-3 py-2">
              <span
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in oklch, ${KINDS[k].color} 18%, transparent)`, color: KINDS[k].color }}
              >
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block font-medium">{KINDS[k].label}</span>
                <span className="block text-xs text-muted-foreground">{KIND_HINT[k]}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Where a page's primary action goes in the desktop header (the phone shows it as a floating button).
const ActionSlot = createContext<HTMLElement | null>(null);

export function Shell() {
  const { vehicle, vehicles } = useCurrentVehicle();
  const { pathname } = useLocation();
  const onGarage = pathname === "/garage";
  const active = vehicles.filter((v) => !v.archived);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const page = nav.find((n) => n.to === pathname) ?? nav[0]!;
  const subtitle = vehicle && [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col lg:max-w-6xl lg:px-8">
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
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

      <header className="hidden items-end justify-between gap-4 pt-8 pb-6 lg:flex">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold">{onGarage ? "Garage" : (vehicle?.name ?? page.label)}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {onGarage ? `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}` : [page.label, subtitle].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div ref={setSlot} className="flex shrink-0 items-center gap-2" />
      </header>

      <main className="flex-1 px-4 pt-4 pb-28 lg:px-0 lg:pt-0 lg:pb-12">
        <ActionSlot.Provider value={slot}>
          <Outlet />
        </ActionSlot.Provider>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
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
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col lg:max-w-3xl lg:px-8">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:h-20 lg:border-0 lg:px-0">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onClose}>Cancel</Button>
        <h1 className="flex-1 truncate text-center font-heading font-semibold lg:text-left lg:text-2xl">{title}</h1>
        <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </header>
      <form
        className="flex-1 space-y-4 p-4 pb-16 lg:px-0"
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

/** Header for standalone pages (settings, report): back on the phone, a plain title next to the sidebar. */
export function PageHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-4 lg:pt-8 lg:pb-2 print:hidden">
      <Button variant="ghost" size="icon" aria-label="Back" className="lg:hidden" onClick={onBack}>
        <ArrowLeft />
      </Button>
      <h1 className="flex-1 font-heading font-semibold lg:text-2xl">{title}</h1>
      {children}
    </header>
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
  "fixed right-[max(1rem,calc(50%-21rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-2xl bg-primary px-5 py-4 font-medium text-primary-foreground shadow-lg shadow-black/40 transition-transform active:scale-95 lg:hidden";

/** The page's main action: a floating button on the phone, a header button on desktop (or `desktop`, if given; null for none). */
export function Fab({
  to,
  onClick,
  label,
  icon: Icon,
  desktop,
}: {
  to?: string;
  onClick?: () => void;
  label: string;
  icon: React.ElementType;
  desktop?: React.ReactNode;
}) {
  const slot = useContext(ActionSlot);
  const content = <><Icon className="size-5" /> {label}</>;
  const header =
    desktop !== undefined ? desktop : to ? (
      <Button asChild><Link to={to}><Icon /> {label}</Link></Button>
    ) : (
      <Button onClick={onClick}><Icon /> {label}</Button>
    );
  return (
    <>
      {to ? <Link to={to} className={fabClass}>{content}</Link> : <button onClick={onClick} className={fabClass}>{content}</button>}
      {slot && createPortal(header, slot)}
    </>
  );
}
