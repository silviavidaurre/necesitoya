import { useCallback, useEffect, useState } from "react";
import { NavPrestador } from "@/components/NavPrestador";
import { PantallaChat } from "@/components/PantallaChat";
import { usePrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonSecundario, Cargando, ErrorDePantalla, Estado, Icono, IconoCirculo, Pantalla, SinConexion, Titulo } from "@/components/ui";
import { pesos, type RubroId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";
import type { Oferta } from "@/lib/tipos";

interface OfertaConPedido extends Oferta {
  pedido: { titulo: string; zona: string; rubro: RubroId; ejemplo: boolean } | null;
  // Solo el nombre de pila del vecino: se le escribe por el chat de la app, su teléfono no se muestra.
  cliente: { nombre: string } | null;
  // Mensajes del chat con el vecino: cuántos hay y cuántos faltan leer.
  mensajes: number;
  sinLeer: number;
}

export default function MisOfertas() {
  const router = useRouter();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [ofertas, setOfertas] = useState<OfertaConPedido[] | null>(null);
  const [error, setError] = useState("");
  // El presupuesto cuyo chat está abierto, si hay alguno.
  const [chat, setChat] = useState<OfertaConPedido | null>(null);

  const prestadorId = prestador?.id;
  const cargar = useCallback(async () => {
    if (!prestadorId) return;
    try {
      const datos = await pedir<{ ofertas: OfertaConPedido[] }>(`/api/ofertas?prestadorId=${encodeURIComponent(prestadorId)}`);
      setOfertas(datos.ofertas);
      setError("");
    } catch {
      setError("Sin conexión. Seguimos intentando.");
    }
  }, [prestadorId]);

  useEffect(() => {
    cargar();
    // Se actualiza sola para que el prestador vea enseguida si lo eligieron o le escribieron.
    const reloj = setInterval(cargar, 12_000);
    return () => clearInterval(reloj);
  }, [cargar]);

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando || !prestador) return <Cargando />;

  const vacio = ofertas !== null && ofertas.length === 0;

  return (
    <>
      <Pantalla conNav>
        <div className="mt-8">
          <Titulo pregunta="¿En qué quedó cada uno?">Mis presupuestos</Titulo>
        </div>

        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {vacio && (
          <div className="mt-10 flex flex-col items-center text-center">
            <IconoCirculo nombre="lista" size={72} />
            <p className="mt-4 text-lg font-bold text-ink">Todavía no enviaste ninguno</p>
            <p className="mt-1 text-[15px] text-ink-500">Elegí un pedido y pasá tu precio.</p>
            <div className="mt-6 w-full">
              <BotonPrimario onClick={() => router.push("/prestador")}>Ver pedidos</BotonPrimario>
            </div>
          </div>
        )}

        <ul className="mt-2 divide-y divide-line">
          {ofertas?.map((oferta) => {
            const pila = oferta.cliente?.nombre || "el vecino";
            // Con los pedidos de ejemplo no hay un vecino del otro lado: no se abre el chat.
            const conChat = Boolean(oferta.pedido) && !oferta.pedido?.ejemplo;
            const soloLectura = oferta.estado === "descartada";
            return (
            <li key={oferta.id} className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-snug text-ink">{oferta.pedido?.titulo ?? "Pedido eliminado"}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {oferta.pedido ? `${oferta.pedido.zona} · ` : ""}Puedo ir: {oferta.cuando.toLowerCase()}
                    {oferta.pedido?.ejemplo ? " · Ejemplo" : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xl font-bold text-ink">{pesos(oferta.precio)}</p>
              </div>
              <p className="mt-2">
                {oferta.estado === "elegida" ? (
                  <Estado tono="bien">Te eligieron</Estado>
                ) : oferta.estado === "descartada" ? (
                  <Estado>Eligió a otro</Estado>
                ) : (
                  <Estado>Esperando respuesta</Estado>
                )}
              </p>
              {conChat && oferta.estado === "elegida" && (
                <p className="mt-3 text-base font-semibold text-ink">Te eligieron. Escribile a {pila} para coordinar.</p>
              )}
              {conChat && oferta.sinLeer > 0 && (
                <p className="mt-2">
                  <Estado tono="bien">Mensaje nuevo de {pila}</Estado>
                </p>
              )}
              {conChat && (!soloLectura || oferta.mensajes > 0) && (
                <div className="mt-4">
                  {oferta.estado === "elegida" ? (
                    <BotonPrimario onClick={() => setChat(oferta)}>Abrir chat</BotonPrimario>
                  ) : (
                    <BotonSecundario onClick={() => setChat(oferta)}>
                      <Icono nombre="mensaje" size={20} />
                      {soloLectura ? "Ver el chat" : "Abrir chat"}
                    </BotonSecundario>
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      </Pantalla>
      {chat && (
        <PantallaChat
          ofertaId={chat.id}
          quien={{ prestadorId: prestador.id }}
          nombre={chat.cliente?.nombre || "Vecino"}
          titulo={chat.pedido?.titulo ?? ""}
          alCerrar={() => {
            setChat(null);
            cargar();
          }}
        />
      )}
      <NavPrestador aviso={Boolean(ofertas?.some((o) => o.sinLeer > 0))} />
    </>
  );
}
