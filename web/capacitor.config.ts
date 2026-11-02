import type { CapacitorConfig } from "@capacitor/cli";

// The APK bundles the web build; it talks to the homelab server URL entered at first launch.
const config: CapacitorConfig = {
  appId: "dev.krymancer.carinfo",
  appName: "Car Info",
  webDir: "dist",
  backgroundColor: "#09090b",
  android: { allowMixedContent: true },
  server: { androidScheme: "https" },
  plugins: {
    // Dark UI: light status/nav bar icons, edge-to-edge with env(safe-area-inset-*) padding.
    SystemBars: { style: "DARK", initialViewportFitValueHint: "cover" },
  },
};

export default config;
