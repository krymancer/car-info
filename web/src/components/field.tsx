import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Labeled text input. `numeric` switches the mobile keyboard to numbers. */
export function Field({
  label,
  value,
  onChange,
  numeric,
  integer,
  suffix,
  hint,
  className,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  integer?: boolean;
  suffix?: string;
  hint?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          inputMode={integer ? "numeric" : numeric ? "decimal" : undefined}
          onChange={(e) => onChange(integer ? e.target.value.replace(/\D/g, "") : e.target.value)}
          className={cn("h-10", suffix && "pr-12")}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
