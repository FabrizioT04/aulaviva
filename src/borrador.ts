// Borrador de un reporte a medio llenar, guardado en el navegador de quien lo escribe.
// Si se cierra la pestaña o se sale sin querer, al volver se recupera.
// localStorage puede no estar disponible (modo privado, almacenamiento lleno): entonces no se guarda nada.

interface Guardado<T> {
  guardado: number;
  datos: T;
}

export function leerBorrador<T>(clave: string, vigenciaMin: number): { datos: T; guardado: Date } | null {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Guardado<T>;
    if (!b?.datos || Date.now() - b.guardado > vigenciaMin * 60_000) {
      localStorage.removeItem(clave);
      return null;
    }
    return { datos: b.datos, guardado: new Date(b.guardado) };
  } catch {
    return null;
  }
}

export function guardarBorrador<T>(clave: string, datos: T): void {
  try {
    localStorage.setItem(clave, JSON.stringify({ guardado: Date.now(), datos } satisfies Guardado<T>));
  } catch {
    // Sin almacenamiento disponible: el formulario sigue funcionando, solo no se recupera
  }
}

export function borrarBorrador(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    // nada que borrar
  }
}
