import { useCallback, useEffect, useRef, useState } from "react";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { useCerrarConAtras } from "@/components/useAtras";
import { BotonMic } from "@/components/BotonMic";
import { Diagnostico } from "@/components/Diagnostico";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { HojaDeAbajo } from "@/components/Hoja";
import { FRANJAS, hoyEnJujuy, mismoTurno, nombreDelDia, numeroDelDia, proximosDias, sumarDias, textoDeTurno, type Franja, type Turno } from "@/lib/turnos";
import { useDictado } from "@/components/useDictado";
import { BotonPrimario, Cabecera, Chip, ErrorDePantalla, Estado, Falta, Icono, claseCampo } from "@/components/ui";
import { MAX_OFERTAS, pesos, rubroPorId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { frasePedidoParaPresupuestar } from "@/lib/frases";
import type { PedidoParaPrestador } from "@/lib/tipos";

const URGENCIA = { hoy: "Para hoy", semana: "Esta semana", flexible: "Sin apuro" } as const;

// Hora en que termina cada franja: la de hoy que ya pasó (o está por terminar) no se sugiere.
const FIN_DE_FRANJA: Record<Franja, number> = { manana: 12, tarde: 17, noche: 21 };

// Tres precios para tocar en vez de escribir: el piso, el medio y el techo de lo que suele costar.
function preciosRapidos(minimo: number | null, maximo: number | null) {
  if (minimo === null || maximo === null) return [];
  const redondo = (valor: number) => Math.round(valor / 1000) * 1000;
  return [...new Set([redondo(minimo), redondo((minimo + maximo) / 2), redondo(maximo)])];
}

// Los 4 próximos turnos que todavía se pueden cumplir, para tocar sin abrir el calendario.
function turnosSugeridos(ahora = Date.now()): Turno[] {
  const hoy = hoyEnJujuy(ahora);
  const horaEnJujuy = new Date(ahora - 3 * 3600_000).getUTCHours();
  const lista: Turno[] = [];
  for (let d = 0; d < 3 && lista.length < 4; d++) {
    for (const franja of FRANJAS) {
      if (d === 0 && horaEnJujuy >= FIN_DE_FRANJA[franja.id] - 1) continue;
      if (lista.length < 4) lista.push({ dia: sumarDias(hoy, d), franja: franja.id });
    }
  }
  return lista;
}

const textoCorto = (turno: Turno) => textoDeTurno(turno).replace(" · ", " ");

// Mandar presupuesto, en una sola hoja: el pedido en una tarjeta (con una línea del diagnóstico), el precio grande,
// cuándo puede ir en una grilla de turnos, un mensaje opcional y un botón. La dirección no se ve hasta que lo eligen.
export function PantallaOferta({
  pedido,
  prestadorId,
  conCuenta = true,
  alAnotarse,
  alCerrar,
  alEnviar,
}: {
  pedido: PedidoParaPrestador;
  // null = todavía no se anotó: puede ver el pedido completo, y para presupuestar primero arma su perfil.
  prestadorId: string | null;
  // false = perfil viejo, creado antes de que la cuenta fuera obligatoria: para presupuestar tiene que entrar.
  conCuenta?: boolean;
  alAnotarse?: () => void;
  alCerrar: () => void;
  alEnviar: () => void;
}) {
  const [precio, setPrecio] = useState("");
  const [sugeridos] = useState(turnosSugeridos);
  // Los turnos que ofrece. Arranca con el primero sugerido marcado.
  const [turnos, setTurnos] = useState<Turno[]>(() => sugeridos.slice(0, 1));
  const [calendario, setCalendario] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [posicion, setPosicion] = useState<number | null>(null);
  const puedePresupuestar = prestadorId !== null && conCuenta && !pedido.yaOferte && pedido.cupos > 0;
  // Sin poder presupuestar, el pedido se ve completo para que la pantalla no quede vacía.
  const [verMas, setVerMas] = useState(!puedePresupuestar);
  useCerrarConAtras(() => (posicion ? alEnviar() : alCerrar()));

  // Copia al día del mensaje: al enviar se espera lo último que se dictó y se manda completo,
  // aunque la pantalla todavía no se haya vuelto a dibujar.
  const mensajeAlDia = useRef("");
  const cambiarMensaje = useCallback((nuevo: string) => {
    mensajeAlDia.current = nuevo;
    setMensaje(nuevo);
  }, []);
  const agregarFrase = useCallback(
    (frase: string) => cambiarMensaje(mensajeAlDia.current ? `${mensajeAlDia.current} ${frase}` : frase),
    [cambiarMensaje],
  );
  const dictado = useDictado(agregarFrase);

  // Mientras está abierta, la página de atrás no se desplaza.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  const rubro = rubroPorId(pedido.rubro);
  const pila = pedido.clienteNombre.split(" ")[0] || "el vecino";
  const numero = Number(precio);
  const rapidos = preciosRapidos(pedido.precioMin, pedido.precioMax);
  const faltaAlgo = numero < 1000 ? "Falta tu precio" : turnos.length === 0 ? "Elegí al menos un día y un horario" : "";
  const puedeEnviar = numero >= 1000 && turnos.length > 0 && puedePresupuestar;
  const lejos =
    numero >= 1000 && pedido.precioMin !== null && pedido.precioMax !== null && (numero < pedido.precioMin * 0.6 || numero > pedido.precioMax * 1.6);
  const otrosTurnos = turnos.filter((t) => !sugeridos.some((s) => mismoTurno(s, t)));
  const alternarTurno = (turno: Turno) =>
    setTurnos((actuales) => (actuales.some((t) => mismoTurno(t, turno)) ? actuales.filter((t) => !mismoTurno(t, turno)) : [...actuales, turno]));

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      // Si estaba dictando, se espera a que llegue lo último que dijo.
      await dictado.terminar();
    } catch {
      // El motivo ya se muestra al lado del micrófono: no se envía el presupuesto con el mensaje a medias.
      setEnviando(false);
      return;
    }
    try {
      const datos = await pedir<{ posicion: number }>("/api/ofertas", {
        method: "POST",
        body: JSON.stringify({ pedidoId: pedido.id, prestadorId, precio: numero, turnos, mensaje: mensajeAlDia.current }),
      });
      setPosicion(datos.posicion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu presupuesto. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const marco = "fixed inset-0 z-30 mx-auto flex w-full max-w-md flex-col bg-white";

  if (posicion) {
    return (
      <div className={marco} role="dialog" aria-modal="true" aria-label="Presupuesto enviado">
        <div className="flex flex-1 flex-col px-5">
          <Cabecera alVolver={alEnviar} cerrar />
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-success-50 text-success">
              <Icono nombre="check" size={44} />
            </span>
            <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink">Presupuesto enviado</h1>
            <p className="cifra mt-3 text-[44px] font-bold leading-none tracking-[-0.03em] text-ink">{pesos(numero)}</p>
            <p className="mt-4 text-[17px] text-ink-500">
              Sos el {posicion} de {MAX_OFERTAS}. Si te eligen, te avisamos en Presupuestos y recién ahí ves la dirección.
            </p>
          </div>
        </div>
        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <BotonPrimario onClick={alEnviar}>Ver más pedidos</BotonPrimario>
        </div>
      </div>
    );
  }

  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Mandar presupuesto">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={alCerrar} cerrar titulo="Mandar presupuesto" />

        <div className="mt-1 rounded-[18px] bg-subtle p-3.5">
          <div className="flex items-center gap-3">
            {pedido.fotoId ? (
              <img src={`/api/fotos?id=${pedido.fotoId}`} alt="Foto que mandó el vecino" className="h-[60px] w-[60px] shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-xl bg-line text-ink" aria-hidden="true">
                <Icono nombre={rubro.id} size={24} />
              </span>
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-base font-bold leading-snug text-ink">{pedido.titulo}</span>
              <span className="text-[13px] text-ink-500">
                {rubro.nombre} · {pedido.zona} · {URGENCIA[pedido.urgencia]}
                {pedido.ejemplo ? " · Ejemplo" : ""}
                {pedido.demo ? " · Demostración" : ""}
              </span>
            </span>
          </div>
          {pedido.diagnostico?.causa && (
            <p className="mt-2.5 flex gap-2 text-sm leading-snug text-ink">
              <Icono nombre="alerta" size={16} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{pedido.diagnostico.causa}</span>
            </p>
          )}
          <button type="button" onClick={() => setVerMas((v) => !v)} aria-expanded={verMas} className="mt-1 flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ink">
            {verMas ? "Ver menos" : "Ver el pedido completo"}
            <Icono nombre="abajo" size={18} className={verMas ? "rotate-180" : ""} />
          </button>
        </div>

        {verMas && (
          <div className="mt-4">
            {pedido.fotoId && <img src={`/api/fotos?id=${pedido.fotoId}`} alt="Foto que mandó el vecino, grande" className="max-h-60 w-full rounded-[22px] object-cover" />}
            <p className="mt-3 text-base text-ink">{pedido.descripcion}</p>
            {pedido.relato && (
              <div className="mt-3 border-l-2 border-line pl-4">
                <p className="text-[13px] font-semibold text-ink-500">Lo que dijo {pila}</p>
                <p className="mt-1 text-[15px] italic text-ink-500">“{pedido.relato}”</p>
              </div>
            )}
            <div className="mt-3">
              <BotonEscuchar
                texto={frasePedidoParaPresupuestar({
                  titulo: pedido.titulo,
                  descripcion: pedido.descripcion,
                  rubro: rubro.nombre,
                  esOtroRubro: rubro.id === "otros",
                  zona: pedido.zona,
                  urgencia: pedido.urgencia,
                  ejemplo: pedido.ejemplo,
                  precioMin: pedido.precioMin,
                  precioMax: pedido.precioMax,
                })}
              />
            </div>
            {pedido.diagnostico && <Diagnostico diagnostico={pedido.diagnostico} para="prestador" />}
          </div>
        )}

        {pedido.yaOferte || pedido.cupos === 0 ? (
          <p className="mt-6 text-[17px] font-semibold text-ink">
            {pedido.yaOferte
              ? "Ya enviaste tu presupuesto."
              : pedido.reservadoMin > 0
                ? `El último lugar está guardado para prestadores de ${pedido.zona}. Se abre para todos en ${pedido.reservadoMin} min.`
                : "Este pedido ya recibió sus 3 presupuestos."}
          </p>
        ) : prestadorId === null ? (
          <p className="mt-6 text-[15px] text-ink-500">Para mandar tu precio primero contanos qué hacés. Es gratis y tarda un minuto.</p>
        ) : !conCuenta ? (
          <EntrarACuenta abiertoAlInicio titulo="Entrá para presupuestar" motivo="Tu perfil queda unido a tu cuenta y no lo perdés si cambiás de celular." />
        ) : (
          <>
            <label className="mt-6 block">
              <span className="text-sm font-semibold text-ink-500">Tu precio</span>
              <span className="relative mt-2 block">
                <span className="cifra pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[36px] font-bold text-ink-500" aria-hidden="true">
                  $
                </span>
                <input
                  className="cifra h-[72px] w-full rounded-[18px] bg-subtle pl-12 pr-[18px] text-[36px] font-bold tracking-[-0.02em] text-ink outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-ink"
                  value={precio ? new Intl.NumberFormat("es-AR").format(Number(precio)) : ""}
                  onChange={(e) => setPrecio(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  placeholder="0"
                  aria-describedby="ayuda-precio"
                />
              </span>
              <span id="ayuda-precio" className="mt-2 block text-[13px] text-ink-500">
                {pedido.precioMin !== null && pedido.precioMax !== null ? `Suele costar ${pesos(pedido.precioMin)} a ${pesos(pedido.precioMax)} de mano de obra.` : "Mano de obra. Los materiales van aparte."}
              </span>
              {lejos && <span className="mt-1 block text-sm font-medium text-ink">Está lejos de lo habitual. Contá por qué en el mensaje.</span>}
            </label>
            {rapidos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {rapidos.map((valor) => (
                  <Chip key={valor} activo={numero === valor} onClick={() => setPrecio(String(valor))}>
                    <span className="cifra">{pesos(valor)}</span>
                  </Chip>
                ))}
              </div>
            )}

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-ink-500">¿Cuándo podés ir?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {sugeridos.map((turno) => {
                  const activo = turnos.some((t) => mismoTurno(t, turno));
                  return (
                    <button
                      key={`${turno.dia}-${turno.franja}`}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => alternarTurno(turno)}
                      className={`h-12 rounded-[14px] border-2 bg-subtle text-[15px] text-ink ${activo ? "border-ink font-bold" : "border-transparent font-semibold"}`}
                    >
                      {textoCorto(turno)}
                    </button>
                  );
                })}
              </div>
              {otrosTurnos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {otrosTurnos.map((turno) => (
                    <button
                      key={`${turno.dia}-${turno.franja}`}
                      type="button"
                      onClick={() => alternarTurno(turno)}
                      aria-label={`Quitar ${textoDeTurno(turno)}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-ink bg-subtle px-3 text-sm font-bold text-ink"
                    >
                      {textoCorto(turno)}
                      <Icono nombre="cerrar" size={14} />
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setCalendario(true)} className="mt-1 flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ink underline underline-offset-[3px]">
                Otros días y horarios
              </button>
              <p className="text-[13px] text-ink-500">
                {turnos.length === 0 ? "Marcá al menos uno." : `${turnos.length} ${turnos.length === 1 ? "horario" : "horarios"} para que ${pila} elija.`}
              </p>
            </fieldset>

            <div className="mt-6">
              <label htmlFor="mensaje-oferta" className="text-sm font-semibold text-ink-500">
                Mensaje para {pila} (opcional)
              </label>
              <div className="mt-2 flex items-start gap-3">
                <textarea
                  id="mensaje-oferta"
                  className={`${claseCampo} min-h-[72px] resize-none rounded-[18px]`}
                  value={dictado.parcial ? `${mensaje} ${dictado.parcial}`.trim() : mensaje}
                  onChange={(e) => cambiarMensaje(e.target.value)}
                  readOnly={dictado.escuchando}
                  maxLength={500}
                  placeholder="Qué incluye, cuánto tardás."
                />
                {dictado.soportado && (
                  <BotonMic
                    escuchando={dictado.escuchando}
                    ocupado={dictado.transcribiendo}
                    onClick={dictado.escuchando ? dictado.parar : dictado.empezar}
                    etiqueta={dictado.escuchando ? "Terminar de dictar" : "Dictar el mensaje"}
                  />
                )}
              </div>
              {(dictado.escuchando || dictado.transcribiendo) && (
                <p className="mt-2" aria-live="polite">
                  {dictado.escuchando ? <Estado tono="mal">Grabando. Tocá el micrófono para terminar</Estado> : <Estado>Pasando a texto</Estado>}
                </p>
              )}
              {dictado.error && (
                <span role="alert" className="mt-2 block text-sm font-medium text-danger">
                  {dictado.error}
                </span>
              )}
            </div>
            {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
          </>
        )}
      </div>

      {!pedido.yaOferte && pedido.cupos > 0 && (
        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {prestadorId === null ? (
            <>
              <BotonPrimario onClick={alAnotarse}>Anotarme y presupuestar</BotonPrimario>
              <p className="mt-2 text-center text-sm text-ink-500">Es gratis. Después volvés a este pedido.</p>
            </>
          ) : !conCuenta ? (
            <Falta>Entrá con tu cuenta para mandar tu precio</Falta>
          ) : (
            <>
              {faltaAlgo && precio !== "" && <Falta>{faltaAlgo}</Falta>}
              <BotonPrimario onClick={enviar} disabled={!puedeEnviar} cargando={enviando}>
                {numero >= 1000 ? (
                  <>
                    Mandar · <span className="cifra">{pesos(numero)}</span>
                  </>
                ) : (
                  "Mandar presupuesto"
                )}
              </BotonPrimario>
              <p className="mt-2 text-center text-sm text-ink-500">Si te eligen, recién ahí ves la dirección.</p>
            </>
          )}
        </div>
      )}

      {calendario && (
        <HojaDeAbajo titulo="¿Cuándo podés ir?" alCerrar={() => setCalendario(false)} pie={<BotonPrimario onClick={() => setCalendario(false)}>Listo</BotonPrimario>}>
          <p className="text-[15px] text-ink-500">Marcá todos los que te sirvan. {pila} elige uno.</p>
          <div className="mt-2 divide-y divide-line">
            {proximosDias().map((dia) => (
              <div key={dia} className="flex items-center gap-3 py-2.5">
                <span className="w-16 shrink-0">
                  <span className="block text-[13px] font-semibold text-ink-500">{nombreDelDia(dia)}</span>
                  <span className="cifra block text-xl font-bold leading-none text-ink">{numeroDelDia(dia)}</span>
                </span>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  {FRANJAS.map((franja) => {
                    const turno = { dia, franja: franja.id };
                    const activo = turnos.some((t) => mismoTurno(t, turno));
                    return (
                      <button
                        key={franja.id}
                        type="button"
                        aria-pressed={activo}
                        aria-label={`${nombreDelDia(dia)} ${numeroDelDia(dia)}, ${franja.texto}`}
                        onClick={() => alternarTurno(turno)}
                        className={`cifra h-11 rounded-xl border-2 text-sm text-ink ${activo ? "border-ink bg-subtle font-bold" : "border-transparent bg-subtle font-semibold"}`}
                      >
                        {franja.texto}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </HojaDeAbajo>
      )}
    </div>
  );
}
