// Reduce la foto en el celular antes de subirla: de ~4 MB a ~200 KB
export async function comprimir(archivo: File): Promise<Blob> {
  const LADO_MAX = 1280;
  let imagen: CanvasImageSource & { width: number; height: number };
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    imagen = await new Promise<HTMLImageElement>((ok, falla) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = falla;
      img.src = URL.createObjectURL(archivo);
    });
  }
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, falla) =>
    lienzo.toBlob((b) => (b ? ok(b) : falla(new Error("sin imagen"))), "image/jpeg", 0.72),
  );
}
