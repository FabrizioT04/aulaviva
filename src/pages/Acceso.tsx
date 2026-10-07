import { useState } from "react";

export default function Acceso({ onIngresar }: { onIngresar: (token: string) => void }) {
  const [clave, setClave] = useState("");
  return (
    <main className="acceso">
      <h1>AulaViva</h1>
      <p>Incidencias tecnológicas de aulas · Soporte de TI, Innova Schools</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (clave.trim()) onIngresar(clave.trim());
        }}
      >
        <label>
          Clave de acceso de TI
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus />
        </label>
        <button className="primario" type="submit">
          Ingresar
        </button>
      </form>
    </main>
  );
}
