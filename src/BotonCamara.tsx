import { useState } from "react";
import { tomarFoto } from "./camara";
import Icono from "./Icono";

export default function BotonCamara({ disabled, onFoto }: {
  disabled: boolean;
  onFoto: (foto: File) => void | Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  return <button type="button" className="boton-foto" disabled={disabled || abierta} onClick={async () => {
    setAbierta(true);
    try {
      const foto = await tomarFoto();
      if (foto) await onFoto(foto);
    } finally { setAbierta(false); }
  }}><Icono nombre="camara" />Tomar foto</button>;
}
