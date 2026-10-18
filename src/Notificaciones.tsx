import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import Icono from "./Icono";
import { guardarTono, LISTA_TONOS, prepararSonido, sonar, tonoElegido, TONOS } from "./sonido";
import type { IdTono } from "./sonido";

// Botón para que TI reciba una notificación push con cada reporte nuevo, aunque el panel esté cerrado.
// El navegador guarda la suscripción; el Worker la usa para avisar (ver worker/push.ts y public/sw.js).

type Estado = "cargando" | "no-soportado" | "sin-claves" | "bloqueado" | "inactivo" | "activo" | "trabajando";

const ETIQUETA: Record<Estado, string> = {
  cargando: "Notificaciones",
  "no-soportado": "Notificaciones",
  "sin-claves": "Notificaciones",
  bloqueado: "Avisos bloqueados",
  inactivo: "Activar avisos",
  activo: "Avisos activados",
  trabajando: "Un momento…",
};

const soportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function mismaClave(sub: PushSubscription, clave: string): boolean {
  const actual = sub.options.applicationServerKey;
  if (!actual) return false;
  const a = new Uint8Array(actual);
  const b = bytes(clave);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function guardar(sub: PushSubscription) {
  await api("/api/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
}

export default function Notificaciones() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [mensaje, setMensaje] = useState("");
  const clave = useRef<string | null>(null);
  const temporizador = useRef<number>(undefined);
  const [menu, setMenu] = useState(false);
  const [tono, setTono] = useState(tonoElegido);
  const contenedor = useRef<HTMLDivElement>(null);

  function avisar(texto: string) {
    setMensaje(texto);
    clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setMensaje(""), 6000);
  }

  useEffect(() => {
    if (!soportado()) return setEstado("no-soportado");
    let vivo = true;
    (async () => {
      const { clave: publica } = await api<{ clave: string | null }>("/api/push");
      if (!publica) return vivo && setEstado("sin-claves");
      clave.current = publica;
      const registro = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "denied") return vivo && setEstado("bloqueado");
      const sub = await registro.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Si cambiaron las claves del servidor, la suscripción vieja ya no sirve
        if (!mismaClave(sub, publica)) {
          await sub.unsubscribe();
          return vivo && setEstado("inactivo");
        }
        await guardar(sub); // por si el servidor la borró o cambió el correo
        return vivo && setEstado("activo");
      }
      if (vivo) setEstado("inactivo");
    })().catch(() => vivo && setEstado("inactivo"));
    return () => {
      vivo = false;
    };
  }, []);

  // El service worker avisa a esta pestaña cuando llega una notificación: suena el tono de AulaViva
  useEffect(() => {
    if (!soportado()) return;
    const alMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === "aviso") sonar(Boolean(e.data.urgente));
    };
    navigator.serviceWorker.addEventListener("message", alMensaje);
    navigator.serviceWorker.startMessages();
    // El audio se habilita con la primera interacción en la página
    document.addEventListener("pointerdown", prepararSonido, { once: true });
    document.addEventListener("keydown", prepararSonido, { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("message", alMensaje);
      document.removeEventListener("pointerdown", prepararSonido);
      document.removeEventListener("keydown", prepararSonido);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setMenu(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  async function probar() {
    setMenu(false);
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (!sub) return setEstado("inactivo");
      await guardar(sub);
      await api("/api/push/prueba", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
      avisar(
        "Enviamos una prueba a este equipo. Si no aparece en unos segundos, revisa que el sistema permita las notificaciones del navegador " +
          "(Ubuntu: Configuración > Notificaciones, con No molestar apagado; Windows: Configuración > Sistema > Notificaciones) y que el navegador siga abierto.",
      );
    } catch {
      avisar("No se pudo enviar la prueba. Revisa tu conexión.");
    }
  }

  function cambiarTono(valor: string) {
    const nuevo = valor === "no" ? null : (valor as IdTono);
    setTono(nuevo);
    guardarTono(nuevo);
    sonar(false, nuevo);
  }

  async function activar() {
    setEstado("trabajando");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        if (permiso === "denied") avisar("Bloqueaste los avisos. Para activarlos, permite las notificaciones de este sitio en el candado de la barra de direcciones.");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(clave.current!) });
      await guardar(sub);
      setEstado("activo");
      await api("/api/push/prueba", { method: "POST" }).catch(() => null);
      avisar("Listo. Te llegará un aviso con cada reporte nuevo; ya te enviamos uno de prueba.");
    } catch {
      setEstado("inactivo");
      avisar("No se pudieron activar los avisos. Intenta de nuevo.");
    }
  }

  async function desactivar() {
    setMenu(false);
    setEstado("trabajando");
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (sub) {
        await api("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
      avisar("Avisos desactivados en este dispositivo.");
    } catch {
      setEstado("activo");
    }
  }

  function tocar() {
    if (estado === "inactivo") return activar();
    if (estado === "activo") return setMenu(!menu);
    if (estado === "bloqueado") {
      return avisar("Las notificaciones están bloqueadas. Permítelas para este sitio en el candado de la barra de direcciones y recarga.");
    }
    if (estado === "no-soportado") {
      return avisar(
        esIphone()
          ? "En iPhone, primero agrega el panel a la pantalla de inicio (Compartir → Agregar a inicio) y ábrelo desde ahí."
          : "Este navegador no permite notificaciones. Prueba con Chrome o Firefox.",
      );
    }
    if (estado === "sin-claves") return avisar("Falta configurar las claves de notificaciones en el servidor (npm run push:claves).");
  }

  const titulo =
    estado === "activo" ? "Recibes un aviso con cada reporte nuevo. Toca para probarlo o cambiar el sonido." : "Recibe un aviso con cada reporte nuevo, aunque el panel esté cerrado.";

  return (
    <div className="avisos" ref={contenedor}>
      <button
        type="button"
        className={`boton-avisos ${estado}`}
        aria-expanded={estado === "activo" ? menu : undefined}
        title={titulo}
        disabled={estado === "cargando" || estado === "trabajando"}
        onClick={tocar}
      >
        <Icono nombre="campana" />
        <span className="etiqueta-avisos">{ETIQUETA[estado]}</span>
        <i aria-hidden="true" />
      </button>
      {menu && (
        <div className="menu-avisos" role="menu">
          <p>Los avisos están activados en este equipo.</p>
          <button type="button" role="menuitem" onClick={probar}>
            Enviar una prueba a este equipo
          </button>
          <div className="tono-avisos">
            <label htmlFor="tono-avisos">Sonido de AulaViva</label>
            <select id="tono-avisos" value={tono ?? "no"} onChange={(e) => cambiarTono(e.target.value)}>
              {LISTA_TONOS.map((id) => (
                <option key={id} value={id}>
                  {TONOS[id].nombre}
                </option>
              ))}
              <option value="no">Sin sonido</option>
            </select>
            <button type="button" disabled={!tono} onClick={() => sonar(false, tono)} title="Escuchar el tono" aria-label="Escuchar el tono">
              <Icono nombre="campana" />
            </button>
          </div>
          <small>Suena con el panel abierto en alguna pestaña. Con el navegador cerrado se usa el sonido del sistema.</small>
          <button type="button" role="menuitem" className="peligro" onClick={desactivar}>
            Desactivar avisos en este equipo
          </button>
        </div>
      )}
      {mensaje && (
        <p className="aviso-avisos" role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}
