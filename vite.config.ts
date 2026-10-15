import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Selector de tema (Claro / Oscuro / Automático). Los estilos se escriben con
// @media (prefers-color-scheme: …) y este plugin duplica cada bloque al compilar:
// - el original solo aplica si no se eligió el tema contrario (modo Automático);
// - la copia, sin la media query, aplica cuando se eligió ese tema (data-tema en <html>).
// El prefijo va dentro de :where() para no cambiar la especificidad de las reglas.
const NOMBRE = { dark: "oscuro", light: "claro" } as const;
const CONTRARIO = { dark: "claro", light: "oscuro" } as const;

interface Regla { selectors: string[]; parent?: { type: string; name?: string } }
interface Bloque {
  params: string;
  raws: Record<string, unknown>;
  clone(o: { params: string }): Bloque & { nodes: unknown[] };
  walkRules(f: (r: Regla) => void): void;
  after(n: unknown): void;
}

function conTema(regla: Regla, condicion: string) {
  if (regla.parent?.type === "atrule" && /keyframes$/.test(regla.parent.name ?? "")) return;
  regla.selectors = regla.selectors.map((s) =>
    s.startsWith(":root") ? `:root${condicion}${s.slice(5)}` : `:where(:root${condicion}) ${s}`,
  );
}

const temaElegible = {
  postcssPlugin: "tema-elegible",
  AtRule: {
    media(bloque: Bloque) {
      const m = bloque.params.match(/\(prefers-color-scheme:\s*(dark|light)\)/);
      if (!m || bloque.raws.temaListo) return;
      const esquema = m[1] as "dark" | "light";
      const resto = bloque.params.replace(m[0], "").replace(/^\s*and\s+|\s+and\s*$/g, "").trim();
      const copia = bloque.clone({ params: resto });
      bloque.walkRules((r) => conTema(r, `:not([data-tema="${CONTRARIO[esquema]}"])`));
      copia.walkRules((r) => conTema(r, `[data-tema="${NOMBRE[esquema]}"]`));
      bloque.raws.temaListo = true;
      bloque.after(resto ? copia : copia.nodes);
    },
  },
};

export default defineConfig({
  plugins: [react(), cloudflare()],
  css: { postcss: { plugins: [temaElegible] } },
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
