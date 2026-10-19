import { useState } from "react";
import type { Ruta } from "../App";
import Registro from "./Registro";
import RegistroCuenta from "./RegistroCuenta";

type Que = "falla" | "cuenta";

// La pestaña Registrar: una falla en un aula, o una atención de cuenta o plataforma (cambio de clave…).
// pedidos: los que enviaron los docentes desde los ML y esperan a TI
export default function Registrar(props: { email: string; onNoAutorizado: () => void; ir: (r: Ruta) => void; inicial: Que; pedidos: number }) {
  const [que, setQue] = useState<Que>(props.inicial);
  function elegir(v: Que) {
    setQue(v);
    // Para que al recargar siga en la misma parte
    history.replaceState(null, "", v === "cuenta" ? "/cuentas" : "/");
  }
  const selector = (
    <div className="segmentado selector-registro" role="group" aria-label="Qué registrar">
      <button type="button" className={que === "falla" ? "activo" : ""} aria-pressed={que === "falla"} onClick={() => elegir("falla")}>
        Falla en un aula
      </button>
      <button type="button" className={que === "cuenta" ? "activo" : ""} aria-pressed={que === "cuenta"} onClick={() => elegir("cuenta")}>
        Cuenta o plataforma
        {props.pedidos > 0 && (
          <span className="cuenta-nav" title={`${props.pedidos} ${props.pedidos === 1 ? "pedido" : "pedidos"} de docentes`}>
            {props.pedidos}
            <span className="solo-lector"> {props.pedidos === 1 ? "pedido" : "pedidos"} de docentes</span>
          </span>
        )}
      </button>
    </div>
  );
  return que === "falla" ? <Registro {...props} selector={selector} /> : <RegistroCuenta email={props.email} onNoAutorizado={props.onNoAutorizado} selector={selector} />;
}
