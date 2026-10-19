import { useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { AulaConEstado } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import Icono from "../Icono";
import { DRAGON_AULAVIVA } from "../../shared/marca";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

// Hoja con un QR por aula, lista para imprimir y pegar junto a la puerta o el proyector
export default function ImprimirQr({ onNoAutorizado, ir }: Props) {
  const [qrs, setQrs] = useState<{ aula: AulaConEstado; svg: string; url: string }[]>([]);
  const [busqueda, setBusqueda] = useState("");
  // Aula que se imprime sola, en tamaño grande para pegarla en la puerta
  const [solo, setSolo] = useState<number | null>(null);

  useEffect(() => {
    if (solo == null) return;
    const listo = () => setSolo(null);
    addEventListener("afterprint", listo);
    // Espera a que React pinte la hoja con un solo QR antes de abrir el diálogo de impresión
    const t = setTimeout(() => print(), 50);
    return () => {
      clearTimeout(t);
      removeEventListener("afterprint", listo);
    };
  }, [solo]);

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

  const buscado = busqueda.trim().toLowerCase();
  const visibles = qrs.filter(
    ({ aula }) =>
      solo === aula.id ||
      (solo == null &&
        (!buscado || [aula.codigo, aula.nombre, aula.seccion ?? "", aula.nivel ?? ""].some((v) => v.toLowerCase().includes(buscado)))),
  );

  return (
    <div className="imprimir-qr">
      <div className="no-imprimir acciones-qr">
        <button className="volver" onClick={() => ir({ pantalla: "dashboard" })}>
          <Icono nombre="volver" /> Dashboard
        </button>
        <button className="primario" onClick={() => print()} disabled={!visibles.length}>
          Imprimir {visibles.length === qrs.length ? `los ${qrs.length}` : visibles.length} QR
        </button>
      </div>
      <label className="buscador no-imprimir">
        <Icono nombre="buscar" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar aula: 204, 4A, primaria…"
          aria-label="Buscar aula"
        />
      </label>
      <p className="no-imprimir vacio">
        Cada QR abre la página de reporte de su aula en {location.host}. "Probar" la abre como la verá el docente, e
        "Imprimir este" saca solo ese QR en tamaño grande para la puerta.
      </p>
      {!qrs.length && <p className="vacio">Generando QR…</p>}
      {qrs.length > 0 && visibles.length === 0 && <p className="vacio">Ninguna aula coincide con "{busqueda}".</p>}
      <section className={solo == null ? "hoja-qr" : "hoja-qr solo"}>
        {visibles.map(({ aula, svg, url }) => (
          <figure key={aula.id} className="qr">
            <div className="qr-imagen" dangerouslySetInnerHTML={{ __html: svg }} />
            <figcaption>
              <strong>
                {aula.nombre}
                {aula.seccion ? ` · ${aula.seccion}` : ""}
              </strong>
              <span>Escanea para reportar una falla a TI</span>
              <em className="marca-qr"><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: DRAGON_AULAVIVA }} />AulaViva · Soporte TI</em>
            </figcaption>
            <div className="acciones-una no-imprimir">
              <a href={url} target="_blank" rel="noopener">
                Probar
              </a>
              <button type="button" className="enlace" onClick={() => setSolo(aula.id)}>
                Imprimir este
              </button>
            </div>
          </figure>
        ))}
      </section>
    </div>
  );
}
