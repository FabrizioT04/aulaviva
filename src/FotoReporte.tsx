import { useEffect, useState } from "react";
import { leerToken } from "./api";

// Miniatura de la foto de evidencia; al tocarla se abre en grande.
// Se descarga con fetch para que funcione igual con Access (cookie) que con la clave local.
export default function FotoReporte({ reporteId }: { reporteId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [grande, setGrande] = useState(false);

  useEffect(() => {
    let creada: string | null = null;
    const token = leerToken();
    fetch(`/api/reportes/${reporteId}/foto`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) setUrl((creada = URL.createObjectURL(b)));
      })
      .catch(() => null);
    return () => {
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [reporteId]);

  if (!url) return null;
  return (
    <>
      <button className="foto-miniatura" onClick={() => setGrande(true)} aria-label="Ver foto del reporte">
        <img src={url} alt="" />
      </button>
      {grande && (
        <div className="foto-grande" role="dialog" aria-label="Foto del reporte" onClick={() => setGrande(false)}>
          <img src={url} alt="Foto del reporte" />
        </div>
      )}
    </>
  );
}
