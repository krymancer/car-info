import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { Kind } from "@/lib/api";
import { CATEGORIES, KINDS, categoryOf } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function CategoryPicker({
  kind,
  value,
  onChange,
}: {
  kind: Exclude<Kind, "fuel">;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = categoryOf(kind, value);
  const Icon = current?.icon ?? KINDS[kind].icon;
  const color = KINDS[kind].color;
  const list = CATEGORIES[kind].filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left"
      >
        <div
          className="flex size-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, color }}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Category</p>
          <p className="font-medium">{current?.label ?? "Choose a category"}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-2xl rounded-t-2xl data-[side=bottom]:h-[85dvh]">
          <SheetHeader><SheetTitle>Select category</SheetTitle></SheetHeader>
          <div className="relative px-4">
            <Search className="absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" className="h-10 rounded-xl pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)]">
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-secondary"
              >
                <div
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, color }}
                >
                  <c.icon className="size-5" />
                </div>
                <span className={c.id === value ? "font-semibold" : ""}>{c.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
