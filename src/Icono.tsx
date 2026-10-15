import { iconoSvg, type NombreIcono } from "../shared/iconos";

// Los trazos son constantes del propio código, no texto del usuario
export default function Icono({ nombre, clase }: { nombre: NombreIcono; clase?: string }) {
  return <span className="icono-caja" dangerouslySetInnerHTML={{ __html: iconoSvg(nombre, clase) }} />;
}
