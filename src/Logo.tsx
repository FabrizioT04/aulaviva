import Icono from "./Icono";

export default function Logo() {
  return (
    <span className="logo">
      <span className="logo-marca">
        <Icono nombre="pulso" />
      </span>
      <span className="logo-texto">
        <strong>AulaViva</strong>
        <small>Soporte TI · Sede SMP1</small>
      </span>
    </span>
  );
}
