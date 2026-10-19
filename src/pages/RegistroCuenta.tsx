import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ACCIONES_CUENTA, ACCIONES_DOCENTE, cuentaDelPedido, PERSONAS, PLATAFORMAS, paraQuien, resumenAtencion, type AccionCuenta, type AtencionCuenta, type PedidoCuenta, type Persona, type Plataforma } from "../../shared/cuentas";
import type { EntradaTi } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import { fechaCorta } from "../formato";
import Icono from "../Icono";
import { useEnVivo } from "../useEnVivo";

const ORIGENES: { valor: EntradaTi; etiqueta: string }[] = [
  { valor: "presencial", etiqueta: "En persona" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "otro", etiqueta: "Otro" },
];

interface Datos {
  recientes: AtencionCuenta[];
  hoy: { registros: number; cuentas: number };
  pedidos: PedidoCuenta[]; // los que enviaron los docentes desde los ML, sin atender
}

const usuario = (email: string) => email.split("@")[0];

// Cambios de clave y soporte en plataformas (Classroom, Pearson, Khan Academy, Elesapiens, ALEKS…):
// pocos toques, para que este trabajo también cuente en el Historial y en el correo del viernes
export default function RegistroCuenta({ email, onNoAutorizado, selector }: { email: string; onNoAutorizado: () => void; selector: ReactNode }) {
  const [accion, setAccion] = useState<AccionCuenta>("clave");
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [persona, setPersona] = useState<Persona>("estudiante");
  const [cantidad, setCantidad] = useState("1");
  const [detalle, setDetalle] = useState("");
  const [nota, setNota] = useState("");
  const [origen, setOrigen] = useState<EntradaTi>("presencial");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [d, setD] = useState<Datos | null>(null);
  // El pedido del docente que se está atendiendo: al registrar, se cierra y el docente lo ve resuelto
  const [pedido, setPedido] = useState<PedidoCuenta | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  const fallo = useCallback(
    (e: unknown) => {
      if (e instanceof NoAutorizado) onNoAutorizado();
      else setMensaje({ ok: false, texto: e instanceof Error && !(e instanceof TypeError) ? e.message : "No se pudo guardar. Intenta de nuevo." });
    },
    [onNoAutorizado],
  );
  const cargar = useCallback(() => api<Datos>("/api/cuentas").then(setD).catch(fallo), [fallo]);
  useEffect(() => {
    cargar();
  }, [cargar]);
  // Un pedido nuevo de un docente, o uno que atendió otra persona de TI
  useEnVivo((evento) => {
    if (!evento || evento.tipo === "cuentas") cargar();
  });
  // Si otra persona de TI lo atendió primero, ya no se está atendiendo
  useEffect(() => {
    if (pedido && d && !d.pedidos.some((p) => p.id === pedido.id)) setPedido(null);
  }, [d, pedido]);

  function atender(p: PedidoCuenta) {
    setPedido(p);
    setAccion(p.accion);
    setPlataforma(p.plataforma);
    setPersona(p.para === "yo" ? "docente" : "estudiante");
    setCantidad(String(p.cantidad));
    setDetalle(p.para === "yo" ? `Prof. ${usuario(p.email)}` : (p.detalle ?? ""));
    setNota(p.descripcion ?? "");
    setMensaje(null);
    formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const n = Number(cantidad);
  const cantidadValida = Number.isInteger(n) && n >= 1 && n <= 200;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!plataforma || !cantidadValida) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const a = await api<AtencionCuenta>("/api/cuentas", {
        method: "POST",
        body: JSON.stringify({ accion, plataforma, persona, cantidad: n, detalle, nota, origen, pedido_id: pedido?.id }),
      });
      setMensaje({
        ok: true,
        texto: pedido
          ? `Pedido cerrado: ${usuario(pedido.email)} ya lo ve como resuelto en Hazio.`
          : `Registrado: ${resumenAtencion(a)}, ${paraQuien(a)}.`,
      });
      setPedido(null);
      // Lo que más se repite es otra cuenta igual: se conservan qué, plataforma y para quién
      setCantidad("1");
      setDetalle("");
      setNota("");
      await cargar();
    } catch (err) {
      fallo(err);
      if (pedido) cargar();
    } finally {
      setEnviando(false);
    }
  }

  const borrar = (a: AtencionCuenta) =>
    api(`/api/cuentas/${a.id}`, { method: "DELETE" })
      .then(cargar)
      .catch(fallo);

  return (
    <div className="registro registro-cuenta">
      <header className="cabecera-pagina">
        <div>
          <h1>Cuentas y plataformas</h1>
          <p className="subtitulo">Cambios de clave del correo y soporte en Classroom, Pearson, Khan Academy, Elesapiens, ALEKS y otras.</p>
        </div>
      </header>
      {selector}
      {d && d.pedidos.length > 0 && (
        <section className="tarjeta pedidos-cuenta">
          <h2>
            Pedidos de docentes <span className="cuenta-nav">{d.pedidos.length}</span>
          </h2>
          <ul className="lista-rondas">
            {d.pedidos.map((p) => (
              <li key={p.id} className={pedido?.id === p.id ? "atendiendo" : ""}>
                <div className="ronda-linea">
                  <strong>
                    {PLATAFORMAS[p.plataforma] ?? p.plataforma}: {ACCIONES_DOCENTE[p.accion] ?? p.accion}
                  </strong>
                  <span>{fechaCorta(p.creado_en)}</span>
                </div>
                <p>
                  {cuentaDelPedido(p)}
                  {p.aula_nombre ? ` · ${p.aula_nombre}` : ""} · pide {usuario(p.email)}
                </p>
                {p.descripcion && <p className="pista">“{p.descripcion}”</p>}
                {pedido?.id !== p.id && (
                  <button type="button" className="atender-pedido" onClick={() => atender(p)}>
                    Atender
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="tarjeta" onSubmit={enviar} ref={formulario}>
        {pedido && (
          <div className="aviso-pedido">
            <span>
              Atendiendo el pedido de <strong>{usuario(pedido.email)}</strong>. Al registrar, el pedido se cierra.
            </span>
            <button type="button" className="enlace" onClick={() => setPedido(null)}>
              Cancelar
            </button>
          </div>
        )}
        <fieldset>
          <legend>¿Qué hiciste?</legend>
          <div className="chips">
            {(Object.keys(ACCIONES_CUENTA) as AccionCuenta[]).map((k) => (
              <button type="button" key={k} className={`chip ${accion === k ? "activo" : ""}`} aria-pressed={accion === k} onClick={() => setAccion(k)}>
                {ACCIONES_CUENTA[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Plataforma</legend>
          <div className="chips">
            {(Object.keys(PLATAFORMAS) as Plataforma[]).map((k) => (
              <button type="button" key={k} className={`chip ${plataforma === k ? "activo" : ""}`} aria-pressed={plataforma === k} onClick={() => setPlataforma(k)}>
                {PLATAFORMAS[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="fila-campos">
          <fieldset>
            <legend>¿Para quién?</legend>
            <div className="segmentado">
              {(Object.keys(PERSONAS) as Persona[]).map((k) => (
                <button type="button" key={k} className={persona === k ? "activo" : ""} aria-pressed={persona === k} onClick={() => setPersona(k)}>
                  {k === "directivo" ? "Directivo" : PERSONAS[k]}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            ¿Cuántas cuentas?
            <input type="number" inputMode="numeric" min={1} max={200} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
        </div>

        <label>
          Sección o nombre (opcional)
          <input value={detalle} maxLength={300} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej. 5A, o Prof. Ramos" />
        </label>
        <label>
          Nota (opcional)
          <textarea rows={2} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ej. no recordaba su clave después de vacaciones" />
        </label>

        <fieldset hidden={pedido !== null}>
          <legend>¿Cómo llegó?</legend>
          <div className="segmentado">
            {ORIGENES.map((o) => (
              <button type="button" key={o.valor} className={origen === o.valor ? "activo" : ""} aria-pressed={origen === o.valor} onClick={() => setOrigen(o.valor)}>
                {o.etiqueta}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="datos-automaticos">
          <Icono nombre="info" />
          <span>No escribas claves aquí. Se guardan solos quién registra y la hora.</span>
        </p>

        <button className="primario" type="submit" disabled={!plataforma || !cantidadValida || enviando}>
          {enviando ? "Registrando…" : pedido ? "Registrar y cerrar el pedido" : "Registrar atención"}
        </button>
        {mensaje && <p className={mensaje.ok ? "aviso ok" : "aviso error"}>{mensaje.texto}</p>}
      </form>

      {d && (
        <section className="tarjeta">
          <div className="titulo-rondas">
            <h2>Últimas atenciones</h2>
            <span className="pista">
              Hoy: {d.hoy.cuentas} {d.hoy.cuentas === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>
          {d.recientes.length === 0 ? (
            <p className="vacio">Todavía no hay atenciones registradas.</p>
          ) : (
            <ul className="lista-rondas">
              {d.recientes.map((a) => (
                <li key={a.id}>
                  <div className="ronda-linea">
                    <strong>{resumenAtencion(a)}</strong>
                    <span>{fechaCorta(a.creado_en)}</span>
                  </div>
                  <p>
                    {paraQuien(a)}
                    {a.detalle ? ` · ${a.detalle}` : ""}
                    {a.email !== email ? ` · ${usuario(a.email)}` : ""}
                    {a.nota ? ` · ${a.nota}` : ""}
                    {a.pedido_id !== null ? " · lo pidió en Hazio" : ""}
                  </p>
                  {a.email === email && Date.now() - new Date(a.creado_en).getTime() < 12 * 3_600_000 && (
                    <button className="enlace peligro borrar-atencion" onClick={() => borrar(a)}>
                      Borrar (fue un error)
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
