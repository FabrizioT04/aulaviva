import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          // Dos páginas: el panel de TI (React) y la página del QR (liviana, sin React)
          input: { main: "index.html", qr: "qr.html" },
        },
      },
    },
  },
});
