import { useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { AulaConEstado } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

// Hoja con un QR por aula, lista para imprimir y pegar junto a la puerta o el proyector
export default function ImprimirQr({ onNoAutorizado, ir }: Props) {
  const [qrs, setQrs] = useState<{ aula: AulaConEstado; svg: string; url: string }[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const aulas = await api<AulaConEstado[]>("/api/aulas");
        // La librería de QR solo se descarga al abrir esta pantalla
        const QRCode = await import("qrcode");
        const lista = await Promise.all(
          aulas.map(async (aula) => {
            const url = `${location.origin}/r/${encodeURIComponent(aula.codigo)}`;
            const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
            return { aula, svg, url };
          }),
        );
        if (!cancelado) setQrs(lista);
      } catch (e) {
        if (e instanceof NoAutorizado) onNoAutorizado();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [onNoAutorizado]);

  return (
    <div className="imprimir-qr">
      <div className="no-imprimir acciones-qr">
        <button className="volver" onClick={() => ir({ pantalla: "dashboard" })}>
          ← Dashboard
        </button>
        <button className="primario" onClick={() => print()} disabled={!qrs.length}>
          Imprimir {qrs.length} QR
        </button>
      </div>
      <p className="no-imprimir vacio">
        Cada QR abre la página de reporte de su aula. Imprímelos después de publicar la app, para que apunten a la
        dirección final.
      </p>
      {!qrs.length && <p className="vacio">Generando QR…</p>}
      <section className="hoja-qr">
        {qrs.map(({ aula, svg }) => (
          <figure key={aula.id} className="qr">
            <div className="qr-imagen" dangerouslySetInnerHTML={{ __html: svg }} />
            <figcaption>
              <strong>{aula.nombre}</strong>
              <span>Escanea para reportar una falla a TI</span>
            </figcaption>
          </figure>
        ))}
      </section>
    </div>
  );
}
