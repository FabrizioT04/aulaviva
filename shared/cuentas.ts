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
}

// "Cambio de clave · Correo institucional"
export const resumenAtencion = (a: Pick<AtencionCuenta, "accion" | "plataforma">) =>
  `${ACCIONES_CUENTA[a.accion] ?? a.accion} · ${PLATAFORMAS[a.plataforma] ?? a.plataforma}`;

const PLURAL: Record<Persona, string> = { estudiante: "estudiantes", docente: "docentes", directivo: "del equipo directivo" };

// "3 estudiantes", "1 docente"
export function paraQuien(a: Pick<AtencionCuenta, "persona" | "cantidad">): string {
  if (a.cantidad === 1 && a.persona !== "directivo") return `1 ${(PERSONAS[a.persona] ?? a.persona).toLowerCase()}`;
  return `${a.cantidad} ${PLURAL[a.persona] ?? a.persona}`;
}
