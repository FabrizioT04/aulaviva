// El límite depende del ambiente del reporte, no de la sección del estudiante.
export function limiteFotos(seccion: string | null | undefined): number {
  return (seccion ?? "").split("/").some((s) => s.trim().toUpperCase() === "ML") ? 6 : 3;
}
