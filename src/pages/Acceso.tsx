import { useState } from "react";
import Logo from "../Logo";

export default function Acceso({ onIngresar }: { onIngresar: (token: string) => void }) {
  const [clave, setClave] = useState("");
  return (
    <main className="acceso">
      <Logo />
      <p>Incidencias tecnológicas de las aulas de Innova Schools.</p>
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
