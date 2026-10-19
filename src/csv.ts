import { HALLAZGOS, type Monitoreo } from "../shared/monitoreo";
import { minutosEntre } from "./formato";

// Descargas "Excel" del panel (Historial y Monitoreo ML)

// En el Excel, "2026-10-16 08:46" (hora de Lima): así se puede ordenar y filtrar como fecha
export function fechaExcel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });
}

// CSV que Excel abre con tildes (BOM UTF-8) y Google Sheets también.
// Un texto escrito por un docente que empieza con = + - @ (o tab/retorno) se abriría como fórmula:
// el apóstrofo delante hace que Excel y Sheets lo muestren como texto.
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null)[][]) {
  const celda = (v: string | number | null) => {
    let t = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// Rondas en los laboratorios ML, en Monitoreo ML y en el Historial
export function csvRondas(rondas: Monitoreo[], nombre: string) {
  descargarCsv(
    nombre,
    ["Inicio", "Fin", "Minutos", "Aula", "Quién", "Resultado", "Nota"],
    rondas.map((r) => [
      fechaExcel(r.inicio),
      fechaExcel(r.fin),
      Math.round(minutosEntre(r.inicio, r.fin) ?? 0),
      `${r.aula_nombre}${r.aula_seccion ? ` · ${r.aula_seccion}` : ""}`,
      r.email,
      r.hallazgos.length ? r.hallazgos.map((h) => HALLAZGOS[h]).join("; ") : "Todo en orden",
      r.nota,
    ]),
  );
}
