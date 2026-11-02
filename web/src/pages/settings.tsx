import { useRef, useState } from "react";
import { useGoBack } from "@/lib/hooks";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, DatabaseBackup, Download, FileText, LogOut, Save, Upload } from "lucide-react";
import { Link } from "react-router";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api, download, getServerUrl, isNativeApp, setServerUrl, setToken } from "@/lib/api";
import { getSettings, quickFuelOnLaunch, reloadSettings, saveSettings, setQuickFuelOnLaunch } from "@/lib/format";
import { Field, Section } from "@/components/field";
import { CarNotesImport } from "@/components/carnotes-import";
import { Button } from "@/components/ui/button";

const stamp = () => new Date().toISOString().slice(0, 10);

export function SettingsPage({ canLogout }: { canLogout: boolean }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState(getSettings());
  const [quickFuel, setQuickFuel] = useState(quickFuelOnLaunch());
  const backupNow = useMutation({
    mutationFn: () => api("/backups", { method: "POST" }),
    onSuccess: () => {
      toast.success("Backup written on the server");
      void qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const file = useRef<HTMLInputElement>(null);
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => api<string[]>("/backups") });

  const importJson = useMutation({
    mutationFn: async (f: File) =>
      api<{ vehicles: number; entries: number; reminders: number }>("/import", { method: "POST", body: JSON.parse(await f.text()) }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.vehicles} vehicles, ${r.entries} records, ${r.reminders} reminders`);
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const savePrefs = () => {
    try {
      new Intl.NumberFormat(prefs.locale, { style: "currency", currency: prefs.currency });
    } catch {
      return toast.error("Unknown locale or currency code");
    }
    saveSettings(prefs);
    reloadSettings();
    void qc.invalidateQueries();
    toast.success("Saved");
  };

  const logout = async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    if (isNativeApp()) setServerUrl(getServerUrl());
    await qc.invalidateQueries();
    navigate("/");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => goBack()}><ArrowLeft /></Button>
        <h1 className="font-heading font-semibold">Settings</h1>
      </header>
      <div className="space-y-4 p-4">
        <Section title="Display">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v.toUpperCase() })} hint="e.g. BRL, USD, EUR" />
            <Field label="Locale" value={prefs.locale} onChange={(v) => setPrefs({ ...prefs, locale: v })} hint="e.g. pt-BR, en-US" />
          </div>
          <Button variant="secondary" onClick={savePrefs}>Save display settings</Button>
          {isNativeApp() && (
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm">
                Open the fuel form on launch
                <span className="block text-xs text-muted-foreground">Log a fill-up in seconds at the pump</span>
              </span>
              <Switch
                checked={quickFuel}
                onCheckedChange={(on) => {
                  setQuickFuel(on);
                  setQuickFuelOnLaunch(on);
                }}
              />
            </label>
          )}
        </Section>

        <Section title="Reports">
          <Button variant="outline" asChild>
            <Link to="/report"><FileText /> Spending report · PDF & CSV</Link>
          </Button>
        </Section>

        <Section title="Import">
          <p className="text-sm text-muted-foreground">
            In Car Notes, export to Excel and pick the file here. You get a preview first; nothing is duplicated if you import twice.
          </p>
          <CarNotesImport />
        </Section>

        <Section title="Backup & restore">
          <p className="text-sm text-muted-foreground">
            The server snapshots the database daily. Download a copy any time, or restore from a JSON export (this replaces everything).
          </p>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
              <Save /> Back up now
            </Button>
            <Button variant="outline" onClick={() => download("/export", `car-info-${stamp()}.json`).catch((e) => toast.error(e.message))}>
              <Download /> Export JSON
            </Button>
            <Button variant="outline" onClick={() => download("/backup.sqlite", `car-info-${stamp()}.sqlite`).catch((e) => toast.error(e.message))}>
              <DatabaseBackup /> Download database (SQLite)
            </Button>
            <Button variant="outline" onClick={() => file.current?.click()} disabled={importJson.isPending}>
              <Upload /> Restore from JSON…
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && confirm("Replace ALL data with this backup? A snapshot of the current data is saved on the server first.")) {
                  importJson.mutate(f);
                }
              }}
            />
          </div>
          {backups.data && backups.data.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {backups.data.length} server snapshots · latest {backups.data[0]}
            </p>
          )}
        </Section>

        {(canLogout || isNativeApp()) && (
          <Section title="Account">
            {isNativeApp() && <p className="text-sm text-muted-foreground">Server: {getServerUrl()}</p>}
            <Button variant="destructive" onClick={logout}><LogOut /> Sign out</Button>
          </Section>
        )}
      </div>
    </div>
  );
}
