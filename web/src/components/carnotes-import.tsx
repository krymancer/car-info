import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Result = {
  dry_run: boolean;
  warnings: string[];
  vehicles: { name: string; plate: string | null; existing: boolean; new_entries: number; duplicates: number }[];
};

/** The export's file name carries a millisecond timestamp; dates after it are typos in Car Notes. */
function exportedAt(file: File) {
  const ms = Number(/(\d{13})/.exec(file.name)?.[1] ?? file.lastModified);
  return new Date(ms).toISOString().slice(0, 10);
}

export function CarNotesImport() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);

  const run = useMutation({
    mutationFn: ({ f, dry }: { f: File; dry: boolean }) =>
      api<Result>(`/import/carnotes?exported_at=${exportedAt(f)}${dry ? "&dry_run=1" : ""}`, { method: "POST", body: f }),
    onSuccess: (r) => {
      if (r.dry_run) return setPreview(r);
      setPreview(null);
      toast.success(`Imported ${r.vehicles.reduce((s, v) => s + v.new_entries, 0)} records`);
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const total = preview?.vehicles.reduce((s, v) => s + v.new_entries, 0) ?? 0;

  return (
    <>
      <Button variant="outline" onClick={() => input.current?.click()} disabled={run.isPending}>
        <FileSpreadsheet /> Import from Car Notes (.xlsx)…
      </Button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            setFile(f);
            run.mutate({ f, dry: true });
          }
        }}
      />
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Car Notes</DialogTitle>
            <DialogDescription>Adds to your data; records you already have are skipped.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {preview?.vehicles.map((v) => (
              <div key={v.name} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[v.plate, v.existing ? "already in garage" : "new vehicle"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-right tabular-nums">
                  {v.new_entries} new
                  {v.duplicates > 0 && <span className="block text-xs text-muted-foreground">{v.duplicates} already here</span>}
                </p>
              </div>
            ))}
          </div>
          {!!preview?.warnings.length && (
            <div className="space-y-1 rounded-lg border border-amber-500/30 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-amber-400"><TriangleAlert className="size-3.5" /> Check these</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {preview.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={!total || run.isPending} onClick={() => file && run.mutate({ f: file, dry: false })}>
              Import {total} records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
