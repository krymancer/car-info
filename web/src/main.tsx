import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { flushOutbox } from "@/lib/outbox";
import { Toaster } from "@/components/ui/sonner";
import { App } from "./app";
import "./index.css";

const MONTH = 30 * 24 * 60 * 60 * 1000;
// The last answers are kept on the device, so the app opens (and the fuel form works) without the server.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000, gcTime: MONTH, networkMode: "offlineFirst" } },
});
const persister = createSyncStoragePersister({ storage: localStorage, key: "car-info-cache" });

const sync = () =>
  void flushOutbox()
    .then((sent) => {
      if (sent > 0) void queryClient.invalidateQueries();
    })
    .catch(console.error);
window.addEventListener("online", sync);
setInterval(sync, 30_000);
sync();
if ("Capacitor" in window) {
  // Android hardware back button walks the router history, exiting at the root.
  void import("@capacitor/app").then(({ App }) => {
    App.addListener("backButton", ({ canGoBack }) => (canGoBack ? history.back() : App.exitApp()));
    App.addListener("resume", sync);
  });
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}
window.addEventListener("car-info:unauthorized", () => void queryClient.invalidateQueries({ queryKey: ["session"] }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: MONTH, buster: "1" }}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-center" />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
