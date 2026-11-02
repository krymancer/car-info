import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes, useNavigate } from "react-router";
import { api, isNativeApp } from "@/lib/api";
import { quickFuelOnLaunch } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Shell } from "@/components/shell";
import { LoginPage } from "@/pages/login";
import { LogPage } from "@/pages/log";
import { EntryFormPage } from "@/pages/entry-form";
import { RemindersPage } from "@/pages/reminders";
import { StatsPage } from "@/pages/stats";
import { GaragePage } from "@/pages/garage";
import { VehicleFormPage } from "@/pages/vehicle-form";
import { SettingsPage } from "@/pages/settings";
import { ReportPage } from "@/pages/report";

export function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ auth_required: boolean; authenticated: boolean }>("/session"),
  });
  const ready = !!session.data?.authenticated;
  const navigate = useNavigate();
  const launched = useRef(false);
  // On the phone, the app is mostly for logging fuel at the pump: open straight into that form.
  useEffect(() => {
    if (!ready || launched.current) return;
    launched.current = true;
    if (isNativeApp() && quickFuelOnLaunch() && location.pathname === "/") navigate("/entry/new?kind=fuel");
  }, [ready, navigate]);

  if (session.isLoading) return <div className="p-6"><Skeleton className="h-10 w-48" /></div>;
  // No session answer means the server is unreachable (or the native app has no URL yet).
  if (!session.data || !session.data.authenticated) {
    return <LoginPage needsPassword={!!session.data?.auth_required} unreachable={!session.data} />;
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<LogPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="garage" element={<GaragePage />} />
      </Route>
      <Route path="entry/new" element={<EntryFormPage />} />
      <Route path="entry/:id" element={<EntryFormPage />} />
      <Route path="garage/new" element={<VehicleFormPage />} />
      <Route path="garage/:id" element={<VehicleFormPage />} />
      <Route path="report" element={<ReportPage />} />
      <Route path="settings" element={<SettingsPage canLogout={session.data.auth_required} />} />
    </Routes>
  );
}
