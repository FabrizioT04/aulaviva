import type { Env } from "./index";

// Solo llamar después de comprobar los permisos del usuario.
export async function eliminarRegistro(env: Env, clase: "reporte" | "dano", id: number) {
  const [fotos, registros] = await env.DB.batch<{ r2_key?: string; aula_id?: number }>([
    env.DB.prepare(`DELETE FROM foto_${clase} WHERE ${clase}_id = ? RETURNING r2_key`).bind(id),
    env.DB.prepare(`DELETE FROM ${clase} WHERE id = ? RETURNING aula_id`).bind(id),
  ]);
  const registro = registros.results[0];
  if (!registro) return null;
  // Las claves foráneas eliminan también los eventos de una falla.
  // La limpieza de archivos no debe convertir una eliminación ya guardada en un error.
  const claves = fotos.results.map((f) => f.r2_key!);
  if (claves.length) {
    try {
      await env.FOTOS.delete(claves);
    } catch {
      console.error("No se pudieron limpiar las fotos del registro eliminado", { clase, id });
    }
  }
  return { aulaId: registro.aula_id! };
}
