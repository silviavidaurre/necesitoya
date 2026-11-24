import { useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";

interface Numeros {
  prestadores: number;
  pedidos: number;
  ofertas: number;
  ofertasDePrueba: number;
}

// Números de uso real, actualizados cada 10 segundos. Los pedidos de ejemplo no cuentan.
export function Contadores() {
  const [numeros, setNumeros] = useState<Numeros | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () =>
      pedir<Numeros>("/api/stats")
        .then((datos) => {
          if (vigente) setNumeros(datos);
        })
        .catch(() => undefined);
    cargar();
    const reloj = setInterval(cargar, 10_000);
    return () => {
      vigente = false;
      clearInterval(reloj);
    };
  }, []);

  const items = [
    { etiqueta: "Prestadores", valor: numeros?.prestadores },
    { etiqueta: "Pedidos", valor: numeros?.pedidos },
    { etiqueta: "Presupuestos", valor: numeros?.ofertas },
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-line">
      {items.map((item, i) => (
        <div key={item.etiqueta} className={i === 0 ? "pr-3" : "px-3"}>
          <p className="text-[13px] text-ink-500">{item.etiqueta}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums leading-none text-ink">{item.valor ?? "–"}</p>
        </div>
      ))}
    </div>
  );
}
