import { useCallback, useEffect, useRef, useState } from "react";
import { Cabecera, Estado, claseCampo } from "@/components/ui";
import { ErrorDePedido, pedir } from "@/lib/cliente";
import type { Mensaje } from "@/lib/tipos";

// Quién escribe: el vecino entra con su pedido y la clave; el prestador, con su id secreto.
export type QuienEscribe = { pedidoId: string; clave: string } | { prestadorId: string };

interface VistaDeChat {
  soy: Mensaje["de"];
  con: { nombre: string };
  pedido: { titulo: string };
  mensajes: Mensaje[];
  abierto: boolean;
  motivo: "" | "muestra" | "descartada" | "lleno";
}

const MAX_LARGO = 500;
const CADA_CUANTO = 4_000;
const AVISO_OCULTO = "Por tu seguridad, los teléfonos no se comparten. Coordinen por acá.";
const CERRADO: Record<string, string> = {
  muestra: "Es un presupuesto de muestra: no hay nadie del otro lado.",
  descartada: "Este presupuesto no fue el elegido. El chat quedó solo para leer.",
  lleno: "Esta conversación llegó al máximo de mensajes.",
};

function hora(fecha: string) {
  const dia = new Date(fecha);
  const reloj = dia.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const esHoy = dia.toDateString() === new Date().toDateString();
  return esHoy ? reloj : `${dia.getDate()}/${dia.getMonth() + 1} ${reloj}`;
}

// Chat de un presupuesto a pantalla completa: con quién se habla arriba, los mensajes en el medio
// y abajo el campo con un solo botón. Es el único canal entre el vecino y el prestador.
export function PantallaChat({
  ofertaId,
  quien,
  nombre,
  titulo,
  alCerrar,
}: {
  ofertaId: string;
  quien: QuienEscribe;
  // Nombre de pila del otro y título del pedido: se muestran desde el primer momento, antes de que cargue el chat.
  nombre: string;
  titulo: string;
  alCerrar: () => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [soy, setSoy] = useState<Mensaje["de"] | null>(null);
  const [motivo, setMotivo] = useState<VistaDeChat["motivo"]>("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [sinSenal, setSinSenal] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [marco, setMarco] = useState<{ top: number; height: number } | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const ultimo = useRef("");

  const credenciales = JSON.stringify(quien);

  // Suma los mensajes que llegan sin repetir ninguno y recuerda la fecha del último para pedir solo los nuevos.
  const sumar = useCallback((nuevos: Mensaje[]) => {
    setMensajes((actuales) => {
      const vistos = new Set((actuales ?? []).map((m) => m.id));
      const juntos = [...(actuales ?? []), ...nuevos.filter((m) => !vistos.has(m.id))].sort((a, b) => a.creado.localeCompare(b.creado));
      ultimo.current = juntos.length > 0 ? juntos[juntos.length - 1].creado : "";
      return juntos;
    });
  }, []);

  const cargar = useCallback(async () => {
    const parametros = new URLSearchParams({ ofertaId, ...(JSON.parse(credenciales) as Record<string, string>) });
    if (ultimo.current) parametros.set("desde", ultimo.current);
    try {
      const vista = await pedir<VistaDeChat>(`/api/chat?${parametros.toString()}`, { espera: 12_000 });
      sumar(vista.mensajes);
      setSoy(vista.soy);
      setMotivo(vista.motivo);
      setSinSenal(false);
    } catch (e) {
      // Si la conversación no es de este celular no tiene sentido insistir: se muestra el motivo.
      if (e instanceof ErrorDePedido && (e.estado === 403 || e.estado === 404)) setError(e.message);
      else setSinSenal(true);
    }
  }, [ofertaId, credenciales, sumar]);

  // Consulta mensajes nuevos cada pocos segundos mientras la pantalla está abierta y a la vista.
  useEffect(() => {
    cargar();
    const reloj = setInterval(() => {
      if (!document.hidden) cargar();
    }, CADA_CUANTO);
    return () => clearInterval(reloj);
  }, [cargar]);

  // Mientras está abierta, la página de atrás no se desplaza.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  // Con el teclado del celular abierto, la pantalla se ajusta a lo que queda a la vista:
  // así el campo y el botón no quedan tapados.
  useEffect(() => {
    const visor = window.visualViewport;
    if (!visor) return;
    const ajustar = () => setMarco(Math.abs(visor.scale - 1) < 0.01 ? { top: visor.offsetTop, height: visor.height } : null);
    ajustar();
    visor.addEventListener("resize", ajustar);
    visor.addEventListener("scroll", ajustar);
    return () => {
      visor.removeEventListener("resize", ajustar);
      visor.removeEventListener("scroll", ajustar);
    };
  }, []);

  // Baja sola al último mensaje cuando llega uno nuevo o cambia el alto (se abre el teclado).
  const cantidad = mensajes?.length ?? 0;
  const alto = marco?.height ?? 0;
  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [cantidad, alto, aviso]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido || enviando) return;
    setError("");
    setEnviando(true);
    try {
      const respuesta = await pedir<{ mensaje: Mensaje; oculto: boolean }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ ofertaId, texto: contenido, ...quien }),
      });
      sumar([respuesta.mensaje]);
      setAviso(respuesta.oculto);
      setTexto("");
    } catch (e) {
      // Lo escrito queda en el campo para reintentar.
      setError(e instanceof Error ? e.message : "No pudimos enviar el mensaje. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeEscribir = motivo === "";

  return (
    <div
      className="fixed inset-0 z-30 mx-auto flex w-full max-w-md flex-col bg-white"
      style={marco ? { top: marco.top, height: marco.height, bottom: "auto" } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`Chat con ${nombre}`}
    >
      <div className="shrink-0 border-b border-line px-6 pb-3">
        <Cabecera alVolver={alCerrar} cerrar />
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">{nombre}</h1>
        <p className="mt-0.5 truncate text-[15px] text-ink-500">{titulo}</p>
      </div>

      <div ref={lista} className="sin-barra flex-1 overflow-y-auto px-6 py-4" aria-live="polite">
        {mensajes === null ? (
          !error && <p className="mt-8 text-center text-[15px] text-ink-500">{sinSenal ? "Sin conexión. Seguimos intentando." : "Cargando"}</p>
        ) : mensajes.length === 0 ? (
          <p className="mt-8 text-center text-[15px] text-ink-500">{puedeEscribir ? "Escribile para coordinar el trabajo." : "No hay mensajes."}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mensajes.map((mensaje) => {
              const mio = mensaje.de === soy;
              return (
                <li key={mensaje.id} className={`flex flex-col ${mio ? "items-end" : "items-start"}`}>
                  <p className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-base text-ink ${mio ? "bg-brand-50" : "bg-subtle"}`}>
                    {mensaje.texto}
                  </p>
                  <span className="mt-1 px-1 text-xs text-ink-500">{hora(mensaje.creado)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {aviso && <p className="mt-4 text-center text-sm font-medium text-ink-500">{AVISO_OCULTO}</p>}
      </div>

      <div className="shrink-0 border-t border-line px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {mensajes !== null && sinSenal && (
          <p className="mb-2">
            <Estado>Sin conexión. Seguimos intentando</Estado>
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {puedeEscribir ? (
          <div className="flex items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Tu mensaje</span>
              <textarea
                className={`${claseCampo} block max-h-32 min-h-12 resize-none py-3`}
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                maxLength={MAX_LARGO}
                enterKeyHint="send"
                placeholder="Escribí tu mensaje"
              />
            </label>
            <button
              type="button"
              onClick={enviar}
              disabled={!texto.trim() || enviando}
              aria-busy={enviando}
              className={`flex min-h-12 shrink-0 items-center justify-center rounded-full bg-brand px-5 text-base font-bold text-white active:bg-brand-600 ${enviando ? "opacity-85" : "disabled:bg-subtle disabled:text-ink-400"}`}
            >
              Enviar
            </button>
          </div>
        ) : (
          <p className="py-2 text-center text-[15px] text-ink-500">{CERRADO[motivo]}</p>
        )}
      </div>
    </div>
  );
}
