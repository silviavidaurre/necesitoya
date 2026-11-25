import { useEffect, useState } from "react";
import { BarraFlotante } from "@/components/BarraFlotante";
import { leerPrestadorId, pedir } from "@/lib/cliente";

// Barra de abajo del prestador: Pedidos · Presupuestos · Perfil.
// `aviso` pone un punto en Presupuestos: hay mensajes de vecinos sin leer. Las pantallas que ya traen sus
// presupuestos lo pasan; las que no (Perfil), lo dejan sin pasar y la barra lo pregunta sola.
export function NavPrestador({ aviso }: { aviso?: boolean }) {
  const propio = useHayMensajesSinLeer(aviso === undefined);
  return (
    <BarraFlotante
      etiqueta="Secciones del prestador"
      pestanas={[
        { href: "/prestador", nombre: "Pedidos", icono: "bandeja" },
        { href: "/prestador/ofertas", nombre: "Presupuestos", icono: "lista", aviso: aviso ?? propio },
        { href: "/prestador/perfil", nombre: "Perfil", icono: "usuario" },
      ]}
    />
  );
}

function useHayMensajesSinLeer(activo: boolean) {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    const prestadorId = activo ? leerPrestadorId() : null;
    if (!prestadorId) return;
    let vigente = true;
    const consultar = () => {
      if (document.visibilityState !== "visible") return;
      pedir<{ ofertas: { sinLeer: number }[] }>(`/api/ofertas?prestadorId=${encodeURIComponent(prestadorId)}`)
        .then((datos) => {
          if (vigente) setHay(datos.ofertas.some((o) => o.sinLeer > 0));
        })
        .catch(() => {
          // Es un aviso extra: sin señal, la barra sigue igual.
        });
    };
    consultar();
    const reloj = setInterval(consultar, 30_000);
    document.addEventListener("visibilitychange", consultar);
    return () => {
      vigente = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", consultar);
    };
  }, [activo]);
  return hay;
}
