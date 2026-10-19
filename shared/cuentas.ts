// Cuentas y plataformas: TI cambia las claves de los correos institucionales (estudiantes, docentes y
// equipo directivo) y da soporte en las plataformas educativas. Se registra qué se hizo, en qué
// plataforma y para quién, nunca la clave. Ver worker/cuentas.ts.

export const ACCIONES_CUENTA = {
  clave: "Cambio de clave",
  acceso: "No podía entrar",
  curso: "Agregar a una clase o curso",
  otro: "Otra consulta",
} as const;

// El orden es el de los botones del registro
export const PLATAFORMAS = {
  correo: "Correo institucional",
  classroom: "Google Classroom",
  pearson: "Pearson",
  khan: "Khan Academy",
  elesapiens: "Elesapiens",
  aleks: "ALEKS",
  otra: "Otra plataforma",
} as const;

export const PERSONAS = {
  estudiante: "Estudiante",
  docente: "Docente",
  directivo: "Equipo directivo",
} as const;

export type AccionCuenta = keyof typeof ACCIONES_CUENTA;
export type Plataforma = keyof typeof PLATAFORMAS;
export type Persona = keyof typeof PERSONAS;

export interface AtencionCuenta {
  id: number;
  accion: AccionCuenta;
  plataforma: Plataforma;
  persona: Persona;
  cantidad: number; // cuántas cuentas (p. ej. las claves de toda una sección)
  detalle: string | null; // la sección o un nombre corto
  nota: string | null;
  origen: "whatsapp" | "presencial" | "otro";
  email: string; // quién de TI lo atendió
  creado_en: string;
  pedido_id: number | null; // si vino de un pedido del docente desde el QR de un ML
}

// Lo que el docente pide desde el QR de un ML: la cuenta de un estudiante o la suya
export interface PedidoCuenta {
  id: number;
  accion: AccionCuenta;
  plataforma: Plataforma;
  para: "yo" | "estudiante";
  cantidad: number; // cuántos estudiantes (1 si es su propia cuenta)
  detalle: string | null; // sección y nombres de los estudiantes
  descripcion: string | null;
  email: string; // el docente
  estado: "pendiente" | "resuelto";
  creado_en: string;
  resuelto_en: string | null;
  aula_id: number | null; // el ML desde donde se pidió
  aula_nombre: string | null;
}

// Las mismas acciones, como las diría el docente (casi siempre de un estudiante)
export const ACCIONES_DOCENTE: Record<AccionCuenta, string> = {
  clave: "Olvidó su clave",
  acceso: "No puede entrar",
  curso: "Agregar a una clase o curso",
  otro: "Otro problema",
};

// De quién es la cuenta del pedido: "Su propia cuenta", "Estudiante: Ana, 5A", "3 estudiantes: 4B…"
export const cuentaDelPedido = (p: Pick<PedidoCuenta, "para" | "cantidad" | "detalle">) =>
  p.para === "yo" ? "Su propia cuenta" : `${p.cantidad > 1 ? `${p.cantidad} estudiantes` : "Estudiante"}: ${p.detalle ?? ""}`;

// "Cambio de clave · Correo institucional"
export const resumenAtencion = (a: Pick<AtencionCuenta, "accion" | "plataforma">) =>
  `${ACCIONES_CUENTA[a.accion] ?? a.accion} · ${PLATAFORMAS[a.plataforma] ?? a.plataforma}`;

const PLURAL: Record<Persona, string> = { estudiante: "estudiantes", docente: "docentes", directivo: "del equipo directivo" };

// "3 estudiantes", "1 docente"
export function paraQuien(a: Pick<AtencionCuenta, "persona" | "cantidad">): string {
  if (a.cantidad === 1 && a.persona !== "directivo") return `1 ${(PERSONAS[a.persona] ?? a.persona).toLowerCase()}`;
  return `${a.cantidad} ${PLURAL[a.persona] ?? a.persona}`;
}
