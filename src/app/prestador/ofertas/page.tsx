import { useCompartirUbicacion } from "@/components/useCompartirUbicacion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCerrarConAtras } from "@/components/useAtras";
import { DeslizarParaConfirmar } from "@/components/Deslizar";
import { BarraDeEstados } from "@/components/EstadosDeTrabajo";
import { PantallaCambiarDia, PantallaReclamo } from "@/components/Gestiones";
import { HojaDeAbajo, OpcionDeHoja } from "@/components/Hoja";
import { Mapa } from "@/components/Mapa";
import { NavPrestador } from "@/components/NavPrestador";
import { PantallaChat } from "@/components/PantallaChat";
import { usePrestador } from "@/components/usePrestador";
import {
  BotonFlotante,
  BotonPrimario,
  BotonRedondo,
  BotonSecundario,
  Cabecera,
  Cargando,
  ErrorDePantalla,
  Estado,
  Icono,
  Pantalla,
  PildoraFlotante,
  Segmentado,
  SinConexion,
  Titulo,
} from "@/components/ui";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { ESTADOS_DE_TRABAJO, sePuedeReprogramar, siguienteEstado, textoDeTurno, type EstadoDeTrabajo } from "@/lib/turnos";
import { pesos, type RubroId } from "@/lib/catalogo";
import { ErrorDePedido, pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/fechas";
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

// Lo que dice el control para deslizar según el paso que sigue.
const DESLIZAR: Partial<Record<EstadoDeTrabajo, string>> = {
  en_camino: "Deslizá cuando salgas",
  llego: "Deslizá cuando llegues",
  trabajando: "Deslizá cuando empieces",
  terminado: "Deslizá cuando termines",
};

// El título grande del trabajo, en primera persona del prestador.
const TITULO_DEL_TRABAJO: Record<EstadoDeTrabajo, string> = {
  confirmado: "Te eligieron",
  en_camino: "En camino",
  llego: "Llegaste",
  trabajando: "Trabajando",
  terminado: "Terminado",
};

interface OfertaConPedido extends Oferta {
  pedido: { titulo: string; zona: string; rubro: RubroId; ejemplo: boolean; confirmado: string | null; estado: "abierto" | "cerrado" | "cancelado" } | null;
  pago: PagoPublico | null;
  reclamos: { de: "vecino" | "prestador"; motivo: string; estado: "abierto" | "resuelto"; resolucion: string }[];
  // Solo mientras el trabajo está activo y solo para el prestador elegido. Si no, null.
  direccion: { calle: string; referencia: string; punto?: { lat: number; lng: number } } | null;
  // Solo el nombre de pila del vecino: se le escribe por el chat de la app, su teléfono no se muestra.
  cliente: { nombre: string } | null;
  // Mensajes del chat con el vecino: cuántos hay y cuántos faltan leer.
  mensajes: number;
  sinLeer: number;
}

type Pestana = "activos" | "enviados" | "terminados";

// En curso = el vecino lo eligió, el pedido sigue abierto para el trabajo y todavía no se terminó.
const enCurso = (o: OfertaConPedido) => o.estado === "elegida" && !o.terminado && o.pedido?.estado === "cerrado" && !o.pedido.confirmado;
const esperando = (o: OfertaConPedido) => o.estado === "enviada" && o.pedido?.estado === "abierto";
const terminado = (o: OfertaConPedido) => o.estado === "elegida" && !enCurso(o);
const conChat = (o: OfertaConPedido) => Boolean(o.pedido) && !o.pedido?.ejemplo;
const pilaDe = (o: OfertaConPedido) => o.cliente?.nombre || "el vecino";
const cuandoDe = (o: OfertaConPedido) => (o.trabajo?.turno ? textoDeTurno(o.trabajo.turno) : o.cuando);

function estadoDeLaOferta(o: OfertaConPedido): { texto: string; tono: "bien" | "neutro" | "mal" } {
  if (o.pedido?.estado === "cancelado") return { texto: "El vecino canceló", tono: "neutro" };
  if (o.estado === "descartada") return { texto: "Eligió a otro", tono: "neutro" };
  if (o.estado === "enviada") return { texto: "Esperando", tono: "neutro" };
  if (o.pedido?.confirmado) return { texto: "Terminado", tono: "bien" };
  if (o.terminado) return { texto: "Falta que confirme", tono: "neutro" };
  return { texto: "Te eligieron", tono: "bien" };
}

// Mis presupuestos: Activos (el trabajo de hoy arriba, como el próximo viaje, y los que esperan respuesta),
// Enviados y Terminados. El trabajo en curso se abre a pantalla completa (?trabajo=…), con el mapa y el
// control para deslizar al próximo estado.
export default function MisOfertas() {
  const router = useRouter();
  const [parametros, setParametros] = useSearchParams();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [ofertas, setOfertas] = useState<OfertaConPedido[] | null>(null);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState<Pestana>("activos");
  // El presupuesto cuyo chat está abierto, si hay alguno.
  const [chat, setChat] = useState<OfertaConPedido | null>(null);
  // El trabajo que está marcando como terminado (pantalla con la foto del después).
  const [cerrando, setCerrando] = useState<OfertaConPedido | null>(null);
  const [gestion, setGestion] = useState<{ oferta: OfertaConPedido; tipo: "reclamo" | "dia" } | null>(null);
  // La hoja con el detalle de un presupuesto de la lista.
  const [detalle, setDetalle] = useState<OfertaConPedido | null>(null);
  const [avanzando, setAvanzando] = useState<string | null>(null);

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
    // Se actualiza sola para que el prestador vea enseguida si lo eligieron o le escribieron. Con la app de fondo
    // no gasta datos, y al volver (por ejemplo, desde Google Maps) se actualiza en el momento.
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible") cargar();
    }, 12_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  // Avanza el trabajo un paso (Salgo, Llegué, Empecé). El último, Terminé, pide la foto del después.
  async function avanzar(oferta: OfertaConPedido) {
    const siguiente = siguienteEstado(oferta.trabajo?.estado ?? "confirmado");
    if (!siguiente || !prestadorId) return;
    if (siguiente === "terminado") return setCerrando(oferta);
    setAvanzando(oferta.id);
    setError("");
    try {
      const respuesta = await pedir<{ trabajo?: Oferta["trabajo"] }>("/api/ofertas/estado", {
        method: "POST",
        body: JSON.stringify({ prestadorId, ofertaId: oferta.id, estado: siguiente }),
      });
      // El paso nuevo se ve enseguida, aunque el refresco que sigue tarde o falle.
      if (respuesta.trabajo) setOfertas((antes) => antes?.map((o) => (o.id === oferta.id ? { ...o, trabajo: respuesta.trabajo } : o)) ?? antes);
      void cargar();
    } catch (e) {
      // 409: el trabajo cambió desde otro lado (otro celular, o el vecino canceló). Se trae cómo está ahora.
      if (e instanceof ErrorDePedido && e.estado === 409) await cargar();
      else setError(e instanceof Error ? e.message : "No pudimos avisar. Probá de nuevo.");
    } finally {
      setAvanzando(null);
    }
  }

  const idDelTrabajo = parametros.get("trabajo");
  const abrirTrabajo = (oferta: OfertaConPedido) => setParametros({ trabajo: oferta.id });
  const cerrarTrabajo = () => {
    const indice = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (indice > 0) window.history.back();
    else setParametros({}, { replace: true });
  };

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando || !prestador) return <Cargando />;

  if (cerrando) {
    return (
      <PantallaTerminado
        oferta={cerrando}
        prestadorId={prestador.id}
        alCerrar={() => setCerrando(null)}
        alTerminar={() => {
          // Se marca terminado acá mismo: si no, por un momento volvería a verse el trabajo "Trabajando".
          const id = cerrando.id;
          setOfertas((antes) => antes?.map((o) => (o.id === id ? { ...o, terminado: o.terminado ?? { creado: new Date().toISOString(), fotoId: null } } : o)) ?? antes);
          setCerrando(null);
          void cargar();
        }}
      />
    );
  }

  const capas = (
    <>
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
          nombre={pilaDe(gestion.oferta)}
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
          actual={cuandoDe(gestion.oferta)}
          turnoActual={gestion.oferta.trabajo?.turno}
          alCerrar={(nuevo) => {
            setGestion(null);
            if (nuevo) cargar();
          }}
        />
      )}
    </>
  );

  const abierto = idDelTrabajo ? ofertas?.find((o) => o.id === idDelTrabajo && o.estado === "elegida") : undefined;
  const trabajo = abierto && enCurso(abierto) ? abierto : undefined;
  // El trabajo que estaba abierto ya no sigue (el vecino canceló, o se terminó): se avisa qué pasó, en vez de
  // cambiar la pantalla por la lista sin explicación.
  if (abierto && !trabajo) {
    return (
      <>
        <TrabajoCerrado oferta={abierto} alVolver={cerrarTrabajo} alEscribir={conChat(abierto) ? () => setChat(abierto) : undefined} />
        {capas}
      </>
    );
  }
  if (trabajo) {
    return (
      <>
        <TrabajoEnCurso
          oferta={trabajo}
          prestadorId={prestador.id}
          ocupado={avanzando === trabajo.id}
          error={error}
          alVolver={cerrarTrabajo}
          alAvanzar={() => avanzar(trabajo)}
          alEscribir={() => setChat(trabajo)}
          alReclamar={() => setGestion({ oferta: trabajo, tipo: "reclamo" })}
          alCambiarDia={() => setGestion({ oferta: trabajo, tipo: "dia" })}
        />
        {capas}
      </>
    );
  }

  const lista = ofertas ?? [];
  const actuales = lista.filter(enCurso);
  const enEspera = lista.filter(esperando);
  const terminados = lista.filter(terminado);
  const vacio = ofertas !== null && lista.length === 0;

  return (
    <>
      <Pantalla conNav>
        <div className="mt-6">
          <Titulo>Mis presupuestos</Titulo>
        </div>
        <div className="mt-4">
          <Segmentado<Pestana>
            opciones={[
              { id: "activos", texto: "Activos" },
              { id: "enviados", texto: "Enviados" },
              { id: "terminados", texto: "Terminados" },
            ]}
            valor={pestana}
            alCambiar={setPestana}
          />
        </div>

        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {/* Mientras llega la primera respuesta, una rueda: con mala señal la pantalla no queda en blanco. */}
        {ofertas === null && !error && (
          <div className="mt-12 flex flex-col items-center gap-3" role="status">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-acento" aria-hidden="true" />
            <span className="text-[15px] text-ink-500">Cargando tus presupuestos</span>
          </div>
        )}

        {vacio && (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-ink">
              <Icono nombre="lista" size={32} />
            </span>
            <p className="mt-4 text-lg font-bold text-ink">Todavía no enviaste ninguno</p>
            <p className="mt-1 text-[15px] text-ink-500">Elegí un pedido y pasá tu precio.</p>
            <div className="mt-6 w-full">
              <BotonPrimario onClick={() => router.push("/prestador")}>Ver pedidos</BotonPrimario>
            </div>
          </div>
        )}

        {!vacio && pestana === "activos" && (
          <>
            <div className="mt-4 flex flex-col gap-3">
              {actuales.map((oferta) => (
                <TarjetaDeTrabajo key={oferta.id} oferta={oferta} alAbrir={() => abrirTrabajo(oferta)} />
              ))}
            </div>
            {enEspera.length > 0 && (
              <>
                <h2 className="mt-6 text-lg font-bold text-ink">Esperando respuesta</h2>
                <ul className="mt-1 divide-y divide-line">
                  {enEspera.map((oferta) => (
                    <li key={oferta.id}>
                      <FilaDeOferta oferta={oferta} alTocar={() => setDetalle(oferta)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {ofertas !== null && actuales.length === 0 && enEspera.length === 0 && (
              <p className="mt-8 text-center text-[15px] text-ink-500">No tenés trabajos en curso ni presupuestos esperando respuesta.</p>
            )}
          </>
        )}

        {!vacio && pestana === "enviados" && (
          <ul className="mt-2 divide-y divide-line">
            {lista.map((oferta) => (
              <li key={oferta.id}>
                <FilaDeOferta oferta={oferta} alTocar={() => (enCurso(oferta) ? abrirTrabajo(oferta) : setDetalle(oferta))} />
              </li>
            ))}
          </ul>
        )}

        {!vacio && pestana === "terminados" && (
          <>
            {terminados.length === 0 && ofertas !== null && <p className="mt-8 text-center text-[15px] text-ink-500">Todavía no terminaste ningún trabajo por la app.</p>}
            <ul className="mt-2 divide-y divide-line">
              {terminados.map((oferta) => (
                <li key={oferta.id}>
                  <FilaDeOferta oferta={oferta} alTocar={() => setDetalle(oferta)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Pantalla>

      {detalle && (
        <HojaDeAbajo titulo={detalle.pedido?.titulo ?? "Pedido eliminado"} alCerrar={() => setDetalle(null)}>
          <p className="text-[15px] text-ink-500">
            {detalle.pedido ? `${detalle.pedido.zona} · ` : ""}Puedo ir: {detalle.cuando.toLowerCase()}
            {detalle.pedido?.ejemplo ? " · Ejemplo" : ""}
          </p>
          <p className="cifra mt-2 text-[28px] font-bold leading-none text-ink">{pesos(detalle.precio)}</p>
          <div className="mt-3 space-y-1.5">
            <p>
              <Estado tono={estadoDeLaOferta(detalle).tono}>{estadoDeLaOferta(detalle).texto}</Estado>
            </p>
            {detalle.pago && (
              <p>
                <Estado tono={detalle.pago.estado === "en_disputa" ? "mal" : detalle.pago.estado === "pendiente" ? "neutro" : "bien"}>{PAGO_PARA_EL_PRESTADOR[detalle.pago.estado]}</Estado>
              </p>
            )}
            {detalle.pedido?.confirmado && <p className="text-sm text-ink-500">Confirmado el {fechaCorta(detalle.pedido.confirmado)}</p>}
            {detalle.reclamos.map((r) => (
              <p key={`${r.de}-${r.motivo}`}>
                {r.estado === "abierto" ? <Estado tono="mal">Reclamo en revisión: {r.motivo.toLowerCase()}</Estado> : <Estado>Reclamo resuelto: {r.resolucion}</Estado>}
              </p>
            ))}
          </div>
          <div className="mt-3">
            {conChat(detalle) && (detalle.estado !== "descartada" || detalle.mensajes > 0) && (
              <OpcionDeHoja
                icono="mensaje"
                titulo={detalle.estado === "descartada" ? "Ver el chat" : `Escribirle a ${pilaDe(detalle)}`}
                detalle={detalle.sinLeer > 0 ? "Tenés un mensaje nuevo" : "Por el chat de la app"}
                onClick={() => {
                  setChat(detalle);
                  setDetalle(null);
                }}
              />
            )}
            {conChat(detalle) && detalle.estado === "elegida" && detalle.pedido?.estado !== "cancelado" && (
              <OpcionDeHoja
                icono="alerta"
                titulo="Tengo un problema"
                detalle="Lo revisa el equipo de NecesitoYa"
                onClick={() => {
                  setGestion({ oferta: detalle, tipo: "reclamo" });
                  setDetalle(null);
                }}
              />
            )}
          </div>
        </HojaDeAbajo>
      )}
      {capas}
      <NavPrestador aviso={Boolean(ofertas?.some((o) => o.sinLeer > 0))} />
    </>
  );
}

// Una fila de la lista: título, barrio y cuándo, y a la derecha el precio y el estado.
function FilaDeOferta({ oferta, alTocar }: { oferta: OfertaConPedido; alTocar: () => void }) {
  const estado = estadoDeLaOferta(oferta);
  return (
    <button type="button" onClick={alTocar} className="flex min-h-[68px] w-full items-center gap-3.5 py-2.5 text-left">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold leading-snug text-ink">{oferta.pedido?.titulo ?? "Pedido eliminado"}</span>
        <span className="text-[13px] text-ink-500">
          {oferta.pedido ? `${oferta.pedido.zona} · ` : ""}
          {cuandoDe(oferta)}
          {oferta.pedido?.ejemplo ? " · Ejemplo" : ""}
        </span>
        {oferta.sinLeer > 0 && <span className="text-[13px] font-semibold text-success">Mensaje nuevo de {pilaDe(oferta)}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="cifra text-base font-bold text-ink">{pesos(oferta.precio)}</span>
        <span className={`flex items-center gap-1.5 text-xs ${estado.tono === "bien" ? "font-semibold text-success" : "text-ink-500"}`}>
          <span className={`h-[7px] w-[7px] rounded-full ${estado.tono === "bien" ? "bg-success" : "bg-ink-500"}`} aria-hidden="true" />
          {estado.texto}
        </span>
      </span>
    </button>
  );
}

// El trabajo de hoy, destacado arriba como el próximo viaje: cuándo, para quién, la dirección (privada, hasta
// terminar), la barra de estados y el botón naranja con el paso que sigue (abre el trabajo para confirmarlo deslizando).
function TarjetaDeTrabajo({ oferta, alAbrir }: { oferta: OfertaConPedido; alAbrir: () => void }) {
  const estado = oferta.trabajo?.estado ?? "confirmado";
  const siguiente = siguienteEstado(estado);
  const boton = ESTADOS_DE_TRABAJO.find((e) => e.id === siguiente)?.boton;
  return (
    // Toda la tarjeta abre el trabajo (con el dedo es lo natural); el botón queda para el teclado y el lector.
    <article onClick={alAbrir} className="flex cursor-pointer flex-col gap-3 rounded-[20px] bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="cifra text-[22px] font-bold leading-tight text-ink">{cuandoDe(oferta)}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-success">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {estado === "confirmado" ? "Te eligieron" : TITULO_DEL_TRABAJO[estado]}
        </span>
      </div>
      <p className="text-[15px] text-ink-500">
        {pilaDe(oferta)} · {oferta.pedido?.titulo} · <span className="cifra font-bold text-ink">{pesos(oferta.precio)}</span>
      </p>
      {oferta.direccion && <Direccion direccion={oferta.direccion} fondo="bg-white" />}
      {oferta.sinLeer > 0 && (
        <p>
          <Estado tono="bien">Mensaje nuevo de {pilaDe(oferta)}</Estado>
        </p>
      )}
      <BarraDeEstados estado={estado} quien="prestador" />
      {boton && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            alAbrir();
          }}
          className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-brand text-[17px] font-bold text-white active:bg-brand-600">
          {boton}
          <Icono nombre="flecha" size={20} />
        </button>
      )}
    </article>
  );
}

function Direccion({ direccion, fondo = "bg-subtle" }: { direccion: { calle: string; referencia: string }; fondo?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${fondo} text-ink`} aria-hidden="true">
        <Icono nombre="casa" size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-ink">{direccion.calle}</span>
        {direccion.referencia && <span className="block text-sm text-ink-500">{direccion.referencia}</span>}
        <span className="flex items-center gap-1 text-[13px] text-ink-500">
          <Icono nombre="candado" size={13} />
          Visible hasta terminar
        </span>
      </span>
    </div>
  );
}

// Trabajo en curso, a pantalla completa: el mapa con el recorrido en naranja, el estado, la dirección privada,
// los botones redondos (mensaje, cómo llegar, problema) y el control para deslizar al próximo estado.
function TrabajoEnCurso({
  oferta,
  prestadorId,
  ocupado,
  error,
  alVolver,
  alAvanzar,
  alEscribir,
  alReclamar,
  alCambiarDia,
}: {
  oferta: OfertaConPedido;
  prestadorId: string;
  ocupado: boolean;
  error: string;
  alVolver: () => void;
  alAvanzar: () => void;
  alEscribir: () => void;
  alReclamar: () => void;
  alCambiarDia: () => void;
}) {
  useCerrarConAtras(alVolver);
  const estado = oferta.trabajo?.estado ?? "confirmado";
  const siguiente = siguienteEstado(estado);
  const accion = ESTADOS_DE_TRABAJO.find((e) => e.id === siguiente)?.boton ?? "";
  const progreso = estado === "confirmado" ? 0 : estado === "en_camino" ? 0.5 : 1;
  // Mientras va en camino (y solo si hay mapa real), el celular manda dónde está para que el vecino lo vea llegar.
  const { estado: ubicacion, punto: miPunto } = useCompartirUbicacion(estado === "en_camino", oferta.id, prestadorId);
  // Cómo llegar: Google Maps con la dirección (que solo ve el prestador elegido, mientras dura el trabajo).
  const destino = oferta.direccion ? `${oferta.direccion.calle}, ${oferta.pedido?.zona ?? ""}, Jujuy, Argentina` : "";
  const comoLlegar = destino ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}` : "";
  useEffect(() => {
    document.title = `${TITULO_DEL_TRABAJO[estado]} · NecesitoYa`;
  }, [estado]);

  return (
    <Pantalla
      mapa={
        // Más bajo que antes: en un celular chico la dirección y los botones quedan a la vista sin bajar.
        // Con Mapbox, el mapa real: la casa y, en camino, dónde va el prestador (su GPS, o el último punto que mandó).
        <Mapa
          alto={300}
          variante={estado === "confirmado" ? "destino" : "ruta"}
          progreso={progreso}
          rutaEnAcento
          iniciales="Vos"
          real={
            oferta.direccion
              ? {
                  calle: oferta.direccion.calle,
                  zona: oferta.pedido?.zona ?? "",
                  punto: oferta.direccion.punto,
                  prestador: estado === "en_camino" ? (miPunto ?? oferta.trabajo?.ubicacion ?? null) : null,
                  oscuro: true,
                }
              : undefined
          }
        >
          <BotonFlotante icono="atras" etiqueta="Volver a mis presupuestos" onClick={alVolver} />
          <PildoraFlotante>
            <span className="cifra">{cuandoDe(oferta)}</span>
          </PildoraFlotante>
        </Mapa>
      }
      pie={
        siguiente && DESLIZAR[siguiente] ? (
          <>
            {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
            {/* Un control nuevo por paso: lo que se mostró en el paso anterior (como el atajo "Confirmar") no pasa al siguiente. */}
            <DeslizarParaConfirmar key={siguiente} texto={DESLIZAR[siguiente] ?? ""} accion={accion} alConfirmar={alAvanzar} ocupado={ocupado} />
          </>
        ) : undefined
      }
    >
      <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{TITULO_DEL_TRABAJO[estado]}</h1>
      <p className="mt-0.5 text-[15px] text-ink-500">
        {pilaDe(oferta)} · {oferta.pedido?.titulo} · <span className="cifra font-bold text-ink">{pesos(oferta.precio)}</span>
      </p>
      {oferta.direccion && (
        <div className="mt-3.5">
          <Direccion direccion={oferta.direccion} />
        </div>
      )}
      {ubicacion === "compartiendo" && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-500">
          <span className="latido h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {pilaDe(oferta)} ve dónde estás hasta que llegues.
        </p>
      )}
      {ubicacion === "sin-permiso" && (
        <p role="status" className="mt-3 text-sm font-semibold text-ink-500">
          Activá la ubicación del celular para que {pilaDe(oferta)} vea que vas en camino.
        </p>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <BotonRedondo icono="mensaje" texto="Mensaje" onClick={alEscribir} aviso={oferta.sinLeer > 0} />
        {comoLlegar && <BotonRedondo icono="navegar" texto="Cómo llegar" onClick={() => window.open(comoLlegar, "_blank", "noopener")} />}
        <BotonRedondo icono="alerta" texto="Problema" onClick={alReclamar} />
        {sePuedeReprogramar(estado) && <BotonRedondo icono="calendario" texto="Cambiar día" onClick={alCambiarDia} />}
      </div>
      <div className="mt-5">
        <BarraDeEstados estado={estado} quien="prestador" />
      </div>
      {oferta.pago && (
        <p className="mt-4">
          <Estado tono={oferta.pago.estado === "en_disputa" ? "mal" : oferta.pago.estado === "pendiente" ? "neutro" : "bien"}>{PAGO_PARA_EL_PRESTADOR[oferta.pago.estado]}</Estado>
        </p>
      )}
    </Pantalla>
  );
}

// El trabajo que tenía abierto ya no está en curso: el vecino canceló, o el prestador avisó que terminó.
// Se dice qué pasó y qué sigue, con un solo botón para volver.
function TrabajoCerrado({ oferta, alVolver, alEscribir }: { oferta: OfertaConPedido; alVolver: () => void; alEscribir?: () => void }) {
  useCerrarConAtras(alVolver);
  const pila = pilaDe(oferta);
  const cancelado = oferta.pedido?.estado === "cancelado";
  const confirmado = Boolean(oferta.pedido?.confirmado);
  const titulo = cancelado ? `${pila.charAt(0).toUpperCase()}${pila.slice(1)} canceló el pedido` : confirmado ? "Trabajo confirmado" : oferta.terminado ? "¡Listo, terminaste!" : "Este trabajo ya no está activo";
  const texto = cancelado
    ? "No hace falta que vayas. Si tuviste algún problema, escribile por el chat."
    : confirmado
      ? `${pila.charAt(0).toUpperCase()}${pila.slice(1)} confirmó que quedó bien. Gracias por usar NecesitoYa.`
      : oferta.terminado
        ? `Ahora ${pila} mira la foto y confirma que quedó bien. Te avisamos cuando lo haga.`
        : "Lo encontrás en tus presupuestos.";
  useEffect(() => {
    document.title = `${titulo} · NecesitoYa`;
  }, [titulo]);
  return (
    <Pantalla pie={<BotonPrimario onClick={alVolver}>Volver a mis presupuestos</BotonPrimario>}>
      <Cabecera alVolver={alVolver} />
      <div className="mt-6 flex flex-col items-start">
        <span className={`flex h-16 w-16 items-center justify-center rounded-full ${cancelado ? "bg-subtle text-ink" : "bg-success text-white"}`} aria-hidden="true">
          <Icono nombre={cancelado ? "cerrar" : "check"} size={30} />
        </span>
        <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">{titulo}</h1>
        <p className="mt-2 text-base leading-snug text-ink-500">{texto}</p>
        <p className="mt-4 text-[15px] text-ink-500">
          {oferta.pedido?.titulo} · <span className="cifra font-bold text-ink">{pesos(oferta.precio)}</span>
        </p>
        {oferta.pago && !cancelado && (
          <p className="mt-2">
            <Estado tono={oferta.pago.estado === "en_disputa" ? "mal" : oferta.pago.estado === "pendiente" ? "neutro" : "bien"}>{PAGO_PARA_EL_PRESTADOR[oferta.pago.estado]}</Estado>
          </p>
        )}
        {alEscribir && (
          <div className="mt-6 w-full">
            <BotonSecundario onClick={alEscribir}>
              <Icono nombre="mensaje" size={20} />
              Escribirle a {pila}
            </BotonSecundario>
          </div>
        )}
      </div>
    </Pantalla>
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
  useCerrarConAtras(alCerrar);

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
      // Si la respuesta anterior se perdió y ya había quedado guardado, no es un error: ya está terminado.
      if (e instanceof ErrorDePedido && e.estado === 409 && /ya marcaste/i.test(e.message)) return alTerminar();
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
      <Cabecera alVolver={alCerrar} cerrar titulo="Trabajo terminado" />
      <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Cómo quedó?</h2>
      <p className="mt-1 text-base text-ink-500">
        {pila} la ve y confirma.{oferta.pago?.modo === "protegido" && oferta.pago.estado === "retenido" ? " Ahí se libera tu pago." : ""}
      </p>
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
