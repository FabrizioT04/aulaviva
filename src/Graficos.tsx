import { useEffect, useRef, useState } from "react";

// Gráficos livianos en SVG para el dashboard (sin librerías): una línea mínima para las
// tarjetas de arriba, el área de reportes por semana y la dona por tipo de falla.

// Ancho real del contenedor, para dibujar el SVG sin estirarlo
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) =>
      setMedida({ ancho: Math.round(e.contentRect.width), alto: Math.round(e.contentRect.height) }),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, medida.ancho, medida.alto] as const;
}

// Curva suave que no se pasa de los puntos (monótona en x)
function curva(p: [number, number][]) {
  if (p.length < 2) return p.length ? `M${p[0][0]},${p[0][1]}` : "";
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function MiniLinea({ valores, etiqueta }: { valores: number[]; etiqueta: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const alto = 40;
  const max = Math.max(1, ...valores);
  const pasos = Math.max(1, valores.length - 1);
  const p = valores.map((v, i) => [(i / pasos) * ancho, 4 + (1 - v / max) * (alto - 8)] as [number, number]);
  const linea = curva(p);
  return (
    <div className="mini-linea" ref={ref} role="img" aria-label={etiqueta}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
          <path d={`${linea} L${ancho},${alto} L0,${alto} Z`} className="mini-linea-area" />
          <path d={linea} className="mini-linea-trazo" />
        </svg>
      )}
    </div>
  );
}

export interface PuntoSemana {
  etiqueta: string; // "13 oct"
  rango: string; // "13 – 19 oct"
  n: number;
}

export function AreaSemanas({ datos }: { datos: PuntoSemana[] }) {
  // Ocupa el alto que le deja la tarjeta (al lado de la dona), con un mínimo de 240 px
  const [ref, ancho, altoCaja] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const alto = Math.max(240, altoCaja);
  const m = { arriba: 12, abajo: 28, izq: 30, der: 8 };
  const max = Math.max(4, ...datos.map((d) => d.n));
  // Escala con 4 líneas guía en números enteros
  const paso = Math.ceil(max / 4);
  const tope = paso * 4;
  const w = Math.max(0, ancho - m.izq - m.der);
  const h = alto - m.arriba - m.abajo;
  const x = (i: number) => m.izq + (datos.length > 1 ? (i / (datos.length - 1)) * w : w / 2);
  const y = (v: number) => m.arriba + (1 - v / tope) * h;
  const puntos = datos.map((d, i) => [x(i), y(d.n)] as [number, number]);
  const linea = curva(puntos);
  const base = y(0);

  function mover(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setActivo(Math.max(0, Math.min(datos.length - 1, Math.round(rel * (datos.length - 1)))));
  }

  const a = activo == null ? null : datos[activo];
  return (
    <div className="area-semanas" ref={ref}>
      {ancho > 0 && (
        <svg
          width={ancho}
          height={alto}
          viewBox={`0 0 ${ancho} ${alto}`}
          role="img"
          aria-label={`Reportes por semana: ${datos.map((d) => `${d.rango}, ${d.n}`).join("; ")}`}
        >
          <defs>
            <linearGradient id="relleno-semanas" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="area-tope" />
              <stop offset="100%" className="area-pie" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k} className="guia">
              <line x1={m.izq} x2={ancho - m.der} y1={y(k * paso)} y2={y(k * paso)} />
              <text x={m.izq - 8} y={y(k * paso)} dy="0.32em" textAnchor="end">
                {k * paso}
              </text>
            </g>
          ))}
          {datos.map((d, i) =>
            // Con poco espacio, una etiqueta sí y otra no
            ancho < 760 && i % 2 !== datos.length % 2 ? null : (
              <text
                key={i}
                className="eje-x"
                x={x(i)}
                y={alto - 8}
                textAnchor={i === 0 ? "start" : i === datos.length - 1 ? "end" : "middle"}
              >
                {d.etiqueta}
              </text>
            ),
          )}
          <path d={`${linea} L${x(datos.length - 1)},${base} L${x(0)},${base} Z`} fill="url(#relleno-semanas)" />
          <path d={linea} className="area-trazo" />
          {a && activo != null && (
            <g className="cursor">
              <line x1={x(activo)} x2={x(activo)} y1={m.arriba} y2={base} />
              <circle cx={x(activo)} cy={y(a.n)} r={5} />
            </g>
          )}
          <rect
            x={m.izq}
            y={0}
            width={w}
            height={alto}
            fill="transparent"
            onPointerMove={mover}
            onPointerDown={mover}
            onPointerLeave={() => setActivo(null)}
          />
        </svg>
      )}
      {a && activo != null && (
        <div
          className="globo"
          style={{ left: Math.min(Math.max(x(activo), 70), ancho - 70), top: Math.max(0, y(a.n) - 62) }}
        >
          <small>{a.rango}</small>
          <strong className="num">
            {a.n} {a.n === 1 ? "reporte" : "reportes"}
          </strong>
        </div>
      )}
    </div>
  );
}

export interface Porcion {
  clave: string;
  etiqueta: string;
  n: number;
}

// Dona con un hueco grande para el total; las porciones van separadas por un espacio
export function Dona({ porciones, total, centro }: { porciones: Porcion[]; total: number; centro: string }) {
  const [activa, setActiva] = useState<string | null>(null);
  const R = 80;
  const grosor = 22;
  const r = R - grosor / 2;
  const circ = 2 * Math.PI * r;
  const hueco = porciones.length > 1 ? 3 : 0; // px de separación entre porciones
  let acumulado = 0;
  const elegida = porciones.find((p) => p.clave === activa);
  return (
    <div className="dona" role="img" aria-label={porciones.map((p) => `${p.etiqueta}: ${p.n}`).join(", ")}>
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} aria-hidden="true">
        <circle cx={R} cy={R} r={r} className="dona-fondo" strokeWidth={grosor} />
        {total > 0 &&
          porciones.map((p, i) => {
            const largo = (p.n / total) * circ;
            const desde = acumulado;
            acumulado += largo;
            return (
              <circle
                key={p.clave}
                cx={R}
                cy={R}
                r={r}
                className={`dona-porcion tono-${i}${activa && activa !== p.clave ? " atenuada" : ""}`}
                strokeWidth={grosor}
                strokeDasharray={`${Math.max(0, largo - hueco)} ${circ}`}
                strokeDashoffset={-desde}
                transform={`rotate(-90 ${R} ${R})`}
                onPointerEnter={() => setActiva(p.clave)}
                onPointerLeave={() => setActiva(null)}
              />
            );
          })}
      </svg>
      <div className="dona-centro">
        <small>{elegida ? elegida.etiqueta : centro}</small>
        <strong className="num">{elegida ? elegida.n : total}</strong>
      </div>
    </div>
  );
}
