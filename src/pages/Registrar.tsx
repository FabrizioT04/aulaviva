import { useState } from "react";
import type { Ruta } from "../App";
import Registro from "./Registro";
import RegistroCuenta from "./RegistroCuenta";

// La pestaña Registrar: una falla en un aula, o una atención de cuenta o plataforma (cambio de clave…)
export default function Registrar(props: { email: string; onNoAutorizado: () => void; ir: (r: Ruta) => void }) {
  const [que, setQue] = useState<"falla" | "cuenta">("falla");
  const selector = (
    <div className="segmentado selector-registro" role="group" aria-label="Qué registrar">
      <button type="button" className={que === "falla" ? "activo" : ""} aria-pressed={que === "falla"} onClick={() => setQue("falla")}>
        Falla en un aula
      </button>
      <button type="button" className={que === "cuenta" ? "activo" : ""} aria-pressed={que === "cuenta"} onClick={() => setQue("cuenta")}>
        Cuenta o plataforma
      </button>
    </div>
  );
  return que === "falla" ? <Registro {...props} selector={selector} /> : <RegistroCuenta email={props.email} onNoAutorizado={props.onNoAutorizado} selector={selector} />;
}
