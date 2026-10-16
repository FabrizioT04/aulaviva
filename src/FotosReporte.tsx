import { useEffect, useState } from "react";
import { leerToken } from "./api";

// Miniaturas de las fotos de evidencia; al tocar una se abre en grande.
// Se descargan con fetch para que funcione igual con Access (cookie) que con la clave local.
// `ruta` cambia de dónde salen (las fotos de un daño están en /api/danos/:id/fotos)
export default function FotosReporte({ reporteId, total, ruta }: { reporteId: number; total: number; ruta?: string }) {
  const base = ruta ?? `/api/reportes/${reporteId}/fotos`;
  const [urls, setUrls] = useState<string[]>([]);
  const [grande, setGrande] = useState<string | null>(null);

  useEffect(() => {
    const creadas: string[] = [];
    let vigente = true;
    const token = leerToken();
    const pedir = (n: number) =>
      fetch(`${base}/${n}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
    Promise.all(Array.from({ length: total }, (_, n) => pedir(n))).then((blobs) => {
      for (const b of blobs) if (b) creadas.push(URL.createObjectURL(b));
      if (vigente) setUrls(creadas);
    });
    return () => {
      vigente = false;
      for (const u of creadas) URL.revokeObjectURL(u);
    };
  }, [base, total]);

  if (!urls.length) return null;
  return (
    <>
      <div className="fotos-reporte">
        {urls.map((url, i) => (
          <button key={url} className="foto-miniatura" onClick={() => setGrande(url)} aria-label={`Ver foto ${i + 1}`}>
            <img src={url} alt="" />
          </button>
        ))}
      </div>
      {grande && (
        <div className="foto-grande" role="dialog" aria-label="Foto del reporte" onClick={() => setGrande(null)}>
          <img src={grande} alt="Foto del reporte" />
        </div>
      )}
    </>
  );
}
