import "./camara.css";

// No se sube nada aquí: la foto vuelve al formulario como cualquier archivo elegido.
export function tomarFoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const anterior = document.activeElement as HTMLElement | null;
    const dialogo = document.createElement("dialog");
    dialogo.className = "camara-foto";
    dialogo.setAttribute("aria-label", "Tomar foto");
    dialogo.innerHTML = `<h2>Tomar foto</h2>
      <p role="status">Permite el acceso a la cámara para ver la imagen.</p>
      <video autoplay muted playsinline></video>
      <div><button type="button" data-cerrar>Cancelar</button>
      <button type="button" data-capturar disabled>Capturar foto</button></div>`;
    const video = dialogo.querySelector("video")!;
    const aviso = dialogo.querySelector("p")!;
    const capturar = dialogo.querySelector<HTMLButtonElement>("[data-capturar]")!;
    let stream: MediaStream | undefined;
    let terminado = false;
    const cerrar = (foto: File | null = null) => {
      if (terminado) return;
      terminado = true;
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      window.removeEventListener("pagehide", salir);
      document.removeEventListener("visibilitychange", ocultar);
      dialogo.close();
      dialogo.remove();
      if (anterior?.isConnected) anterior.focus();
      resolve(foto);
    };
    const salir = () => cerrar();
    const ocultar = () => { if (document.hidden) cerrar(); };
    dialogo.querySelector("[data-cerrar]")!.addEventListener("click", salir);
    dialogo.addEventListener("cancel", (event) => { event.preventDefault(); cerrar(); });
    window.addEventListener("pagehide", salir);
    document.addEventListener("visibilitychange", ocultar);
    document.body.append(dialogo);
    dialogo.showModal();
    video.addEventListener("loadeddata", () => {
      if (terminado) return;
      capturar.disabled = false;
      aviso.textContent = "Encuadra el equipo y pulsa Capturar foto.";
    });
    capturar.addEventListener("click", () => {
      if (!video.videoWidth || !video.videoHeight) return;
      capturar.disabled = true;
      try {
        const canvas = document.createElement("canvas");
        const escala = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);
        const contexto = canvas.getContext("2d");
        if (!contexto) throw new Error("canvas");
        contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (terminado) return;
          if (blob) cerrar(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
          else {
            aviso.textContent = "No se pudo capturar la foto. Inténtalo otra vez.";
            capturar.disabled = false;
          }
        }, "image/jpeg", 0.85);
      } catch {
        aviso.textContent = "No se pudo capturar la foto. Inténtalo otra vez.";
        capturar.disabled = false;
      }
    });
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("sin-soporte");
        const nueva = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        // Si se canceló mientras el navegador pedía permiso, apagar también esa cámara.
        if (terminado) { nueva.getTracks().forEach((track) => track.stop()); return; }
        stream = nueva;
        video.srcObject = stream;
        await video.play();
      } catch (error) {
        if (terminado) return;
        stream?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        video.hidden = true;
        capturar.disabled = true;
        const nombre = error instanceof Error ? error.name : "";
        aviso.textContent = nombre === "NotAllowedError"
          ? "El acceso a la cámara está bloqueado. Permítelo en los ajustes del navegador o cancela y usa Elegir fotos."
          : nombre === "NotFoundError"
            ? "No se encontró una cámara. Puedes cancelar y usar Elegir fotos."
            : "No se pudo abrir la cámara. Cierra otras aplicaciones que la usen o cancela y usa Elegir fotos.";
      }
    })();
  });
}
