// Borrador de un reporte a medio llenar, guardado en el navegador de quien lo escribe.
// Si se cierra la pestaña o se sale sin querer, al volver se recupera.
// localStorage puede no estar disponible (modo privado, almacenamiento lleno): entonces no se guarda nada.
// La clave lleva el correo de quien escribe: si otra persona usa el mismo navegador, no ve el borrador ajeno.

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

// Borra los borradores vencidos de cualquier persona o aula, y los de antes de que la clave llevara
// el correo, para que no queden guardados en el equipo aunque nadie vuelva a abrir esa aula
export function limpiarBorradores(vigenciaMin: number): void {
  try {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.startsWith("aulaviva:borrador")) continue;
      if (!clave.includes("@")) localStorage.removeItem(clave);
      else leerBorrador(clave, vigenciaMin);
    }
  } catch {
    // sin almacenamiento disponible
  }
}

export function borrarBorrador(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    // nada que borrar
  }
}
