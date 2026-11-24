import { useCallback, useEffect, useRef, useState } from "react";
import { PantallaCambiarDia, PantallaReclamo } from "@/components/Gestiones";
import { NavPrestador } from "@/components/NavPrestador";
import { PantallaChat } from "@/components/PantallaChat";
import { usePrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonSecundario, Cabecera, Cargando, ErrorDePantalla, Estado, Icono, IconoCirculo, Pantalla, SinConexion, Titulo } from "@/components/ui";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { pesos, type RubroId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";
import type { EstadoDePago, Oferta, PagoPublico } from "@/lib/tipos";

const PAGO_PARA_EL_PRESTADOR: Record<EstadoDePago, string> = {
  pendiente: "Todavía no pagó por la app",
  retenido: "Pago retenido: se libera cuando el vecino confirme",
  liberado: "Pago liberado a tu billetera",
  en_disputa: "Pago en reclamo",
  resuelto: "Reclamo del pago resuelto",
  vencido: "El pago venció sin pagarse",
  cancelado: "Pago cancelado",
  pagado: "Pagado a tu billetera",
};

interface OfertaConPedido extends Oferta {
  pedido: { titulo: string; zona: string; rubro: RubroId; ejemplo: boolean; confirmado: string | null; estado: "abierto" | "cerrado" | "cancelado" } | null;
  pago: PagoPublico | null;
  reclamos: { de: "vecino" | "prestador"; motivo: string; estado: "abierto" | "resuelto"; resolucion: string }[];
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
  // El trabajo que está marcando como terminado (pantalla con la foto del después).
  const [cerrando, setCerrando] = useState<OfertaConPedido | null>(null);
  const [gestion, setGestion] = useState<{ oferta: OfertaConPedido; tipo: "reclamo" | "dia" } | null>(null);

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

  if (cerrando) {
    return (
      <PantallaTerminado
        oferta={cerrando}
        prestadorId={prestador.id}
        alCerrar={() => setCerrando(null)}
        alTerminar={() => {
          setCerrando(null);
          cargar();
        }}
      />
    );
  }

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
              {conChat && oferta.estado === "elegida" && !oferta.terminado && (
                <p className="mt-3 text-base font-semibold text-ink">Te eligieron. Escribile a {pila} para coordinar.</p>
              )}
              {oferta.estado === "elegida" && (oferta.terminado || oferta.pago) && (
                <div className="mt-2 space-y-1">
                  {oferta.terminado && (
                    <p>
                      {oferta.pedido?.confirmado ? <Estado tono="bien">{pila} confirmó que quedó bien</Estado> : <Estado>Esperando que {pila} confirme</Estado>}
                    </p>
                  )}
                  {oferta.reclamos.map((r) => (
                    <p key={`${r.de}-${r.motivo}`}>
                      {r.estado === "abierto" ? <Estado tono="mal">Reclamo en revisión: {r.motivo.toLowerCase()}</Estado> : <Estado>Reclamo resuelto: {r.resolucion}</Estado>}
                    </p>
                  ))}
                  {oferta.pago && (
                    <p>
                      <Estado tono={oferta.pago.estado === "en_disputa" ? "mal" : oferta.pago.estado === "pendiente" ? "neutro" : "bien"}>
                        {PAGO_PARA_EL_PRESTADOR[oferta.pago.estado]}
                      </Estado>
                    </p>
                  )}
                </div>
              )}
              {conChat && oferta.sinLeer > 0 && (
                <p className="mt-2">
                  <Estado tono="bien">Mensaje nuevo de {pila}</Estado>
                </p>
              )}
              {conChat && oferta.estado === "elegida" && oferta.pedido?.estado !== "cancelado" && (
                <div className="mt-3 flex flex-wrap gap-x-6">
                  {!oferta.terminado && (
                    <button type="button" onClick={() => setGestion({ oferta, tipo: "dia" })} className="flex min-h-12 items-center text-[15px] font-semibold text-brand">
                      Cambiar el día
                    </button>
                  )}
                  <button type="button" onClick={() => setGestion({ oferta, tipo: "reclamo" })} className="flex min-h-12 items-center text-[15px] font-semibold text-ink-500">
                    Tengo un problema
                  </button>
                </div>
              )}
              {oferta.pedido?.estado === "cancelado" && (
                <p className="mt-2">
                  <Estado>El vecino canceló el pedido</Estado>
                </p>
              )}
              {conChat && (!soloLectura || oferta.mensajes > 0) && (
                <div className="mt-4">
                  {oferta.estado === "elegida" && !oferta.terminado && oferta.pedido?.estado !== "cancelado" ? (
                    <div className="space-y-3">
                      <BotonPrimario onClick={() => setCerrando(oferta)}>Trabajo terminado</BotonPrimario>
                      <BotonSecundario onClick={() => setChat(oferta)}>
                        <Icono nombre="mensaje" size={20} />
                        Abrir chat
                      </BotonSecundario>
                    </div>
                  ) : oferta.estado === "elegida" ? (
                    <BotonSecundario onClick={() => setChat(oferta)}>
                      <Icono nombre="mensaje" size={20} />
                      Abrir chat
                    </BotonSecundario>
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
      {gestion?.tipo === "reclamo" && (
        <PantallaReclamo
          ofertaId={gestion.oferta.id}
          quien={{ prestadorId: prestador.id }}
          nombre={gestion.oferta.cliente?.nombre || "el vecino"}
          alCerrar={(enviado) => {
            setGestion(null);
            if (enviado) cargar();
          }}
        />
      )}
      {gestion?.tipo === "dia" && (
        <PantallaCambiarDia
          ofertaId={gestion.oferta.id}
          quien={{ prestadorId: prestador.id }}
          actual={gestion.oferta.cuando}
          alCerrar={(nuevo) => {
            setGestion(null);
            if (nuevo) cargar();
          }}
        />
      )}
      <NavPrestador aviso={Boolean(ofertas?.some((o) => o.sinLeer > 0))} />
    </>
  );
}

// "Trabajo terminado": una foto de cómo quedó y un botón. El vecino la ve y confirma.
function PantallaTerminado({
  oferta,
  prestadorId,
  alCerrar,
  alTerminar,
}: {
  oferta: OfertaConPedido;
  prestadorId: string;
  alCerrar: () => void;
  alTerminar: () => void;
}) {
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const pila = oferta.cliente?.nombre || "El vecino";

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setPreparando(true);
    try {
      setFoto(await achicarFoto(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos usar esa foto. Probá con otra.");
    } finally {
      setPreparando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function enviar() {
    if (!foto) return;
    setEnviando(true);
    setError("");
    try {
      await pedir("/api/ofertas/terminar", {
        method: "POST",
        body: JSON.stringify({ prestadorId, ofertaId: oferta.id, foto: { tipo: foto.tipo, base64: foto.base64 } }),
        espera: 45_000,
      });
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <Pantalla
      pie={
        <>
          {!foto && <p className="mb-2 text-center text-[15px] font-medium text-ink-500">Falta la foto de cómo quedó</p>}
          <BotonPrimario onClick={enviar} disabled={!foto} cargando={enviando}>
            Avisar que terminé
          </BotonPrimario>
        </>
      }
    >
      <Cabecera alVolver={alCerrar} cerrar />
      <Titulo pregunta={`${pila} la ve y confirma. Si pagó por la app, ahí se libera tu pago.`}>¿Cómo quedó?</Titulo>
      <p className="mt-4 text-base font-semibold text-ink">{oferta.pedido?.titulo}</p>
      <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
      <div className="mt-6">
        {foto ? (
          <>
            <img src={foto.vistaPrevia} alt="Foto del trabajo terminado" className="max-h-80 w-full rounded-[22px] object-cover" />
            <button type="button" onClick={() => entrada.current?.click()} className="mt-2 flex min-h-12 items-center text-base font-semibold text-brand">
              Cambiar la foto
            </button>
          </>
        ) : (
          <BotonSecundario onClick={() => entrada.current?.click()} disabled={preparando}>
            <Icono nombre="camara" size={20} />
            {preparando ? "Preparando la foto" : "Sacar la foto del después"}
          </BotonSecundario>
        )}
      </div>
      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
    </Pantalla>
  );
}
