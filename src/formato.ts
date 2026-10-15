export const ETIQUETA_FALLA: Record<string, string> = {
  internet: "Internet",
  proyector: "Proyector",
  pc: "PC",
  otro: "Otro",
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  abierto: "Abierto",
  en_atencion: "En atención",
  resuelto: "Resuelto",
};

export function duracion(minutos: number | null | undefined): string {
  if (minutos == null) return "—";
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function minutosDesde(fecha: string): number {
  return (Date.now() - new Date(fecha).getTime()) / 60000;
}

export function minutosEntre(desde: string, hasta: string | null): number | null {
  return hasta ? (new Date(hasta).getTime() - new Date(desde).getTime()) / 60000 : null;
}

export function fechaCorta(fecha: string): string {
  return new Date(fecha).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "4A · Primaria · Pabellón A", con lo que tenga el aula
export function descripcionAula(a: { seccion: string | null; nivel: string | null; pabellon: string | null }): string {
  return [a.seccion, a.nivel, a.pabellon && `Pabellón ${a.pabellon}`].filter(Boolean).join(" · ");
}
