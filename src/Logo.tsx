import { DRAGON_AULAVIVA } from "../shared/marca";

export default function Logo() {
  return (
    <span className="logo">
      <span className="logo-marca" dangerouslySetInnerHTML={{ __html: DRAGON_AULAVIVA }} />
      <span className="logo-texto">
        <strong>AulaViva</strong>
        <small>Soporte TI · Sede SMP1</small>
      </span>
    </span>
  );
}
