import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered in main.tsx, skipped inside the Android app
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Car Info",
        short_name: "Car Info",
        description: "Track maintenance, upgrades, fuel and every cent spent on your vehicles.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // Recent API reads stay viewable when the homelab is unreachable.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: { cacheName: "api", networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173, host: true, proxy: { "/api": "http://localhost:8080" } },
  build: { outDir: "dist", emptyOutDir: true },
});
