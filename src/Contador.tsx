import { useEffect, useRef, useState } from "react";

// Número que sube (o baja) desde su valor anterior hasta el nuevo; al cargar parte de 0.
// Con "reducir movimiento" activado en el sistema muestra el valor directo.
export default function Contador({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(0);
  const actual = useRef(0);

  useEffect(() => {
    const inicio = actual.current;
    if (inicio === valor || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      actual.current = valor;
      setMostrado(valor);
      return;
    }
    const DURACION = 900;
    const t0 = performance.now();
    let cuadro = requestAnimationFrame(function paso(t) {
      const avance = Math.min(1, (t - t0) / DURACION);
      const n = Math.round(inicio + (valor - inicio) * (1 - (1 - avance) ** 3));
      actual.current = n;
      setMostrado(n);
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  return <>{mostrado}</>;
}
