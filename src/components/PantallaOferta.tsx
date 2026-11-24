import { useCallback, useEffect, useRef, useState } from "react";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { BotonMic } from "@/components/BotonMic";
import { Diagnostico } from "@/components/Diagnostico";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { OfrecerTurnos, combinarTurnos } from "@/components/Turnos";
import { hoyEnJujuy, sumarDias, type Franja } from "@/lib/turnos";
import { useDictado } from "@/components/useDictado";
import { BotonPrimario, Cabecera, Chip, ErrorDePantalla, Estado, Falta, Icono, claseCampo } from "@/components/ui";
import { MAX_OFERTAS, pesos, rubroPorId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { frasePedidoParaPresupuestar } from "@/lib/frases";
import type { PedidoParaPrestador } from "@/lib/tipos";

const URGENCIA = { hoy: "Para hoy", semana: "Esta semana", flexible: "Sin apuro" } as const;

// Tres precios para tocar en vez de escribir: el piso, el medio y el techo de lo que suele costar.
function preciosRapidos(minimo: number | null, maximo: number | null) {
  if (minimo === null || maximo === null) return [];
  const redondo = (valor: number) => Math.round(valor / 1000) * 1000;
  return [...new Set([redondo(minimo), redondo((minimo + maximo) / 2), redondo(maximo)])];
}

// Presupuestar a pantalla completa: el pedido arriba (con el relato y la foto tal como llegaron),
// el precio como protagonista y un solo botón.
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
  // Días y franjas que ofrece. Si el pedido es para hoy, arranca con hoy a la tarde marcado.
  const [dias, setDias] = useState<string[]>(pedido.urgencia === "hoy" ? [hoyEnJujuy()] : [sumarDias(hoyEnJujuy(), 1)]);
  const [franjas, setFranjas] = useState<Franja[]>(["tarde"]);
  const turnos = combinarTurnos(dias, franjas);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [posicion, setPosicion] = useState<number | null>(null);

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
  const numero = Number(precio);
  const rapidos = preciosRapidos(pedido.precioMin, pedido.precioMax);
  const faltaAlgo = numero < 1000 ? "Falta tu precio" : turnos.length === 0 ? "Elegí al menos un día y un horario" : "";
  const puedeEnviar = numero >= 1000 && turnos.length > 0 && !pedido.yaOferte && pedido.cupos > 0 && conCuenta;
  const lejos =
    numero >= 1000 && pedido.precioMin !== null && pedido.precioMax !== null && (numero < pedido.precioMin * 0.6 || numero > pedido.precioMax * 1.6);

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
        <div className="flex flex-1 flex-col px-6">
          <Cabecera alVolver={alEnviar} cerrar />
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-subtle text-success">
              <Icono nombre="check" size={44} />
            </span>
            <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink">Presupuesto enviado</h1>
            <p className="mt-3 text-[44px] font-bold leading-none tracking-[-0.03em] text-ink">{pesos(numero)}</p>
            <p className="mt-4 text-[17px] text-ink-500">
              Sos el {posicion} de {MAX_OFERTAS}. Si te eligen, te avisamos en Mis presupuestos.
            </p>
          </div>
        </div>
        <div className="px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <BotonPrimario onClick={alEnviar}>Ver más pedidos</BotonPrimario>
        </div>
      </div>
    );
  }

  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Enviar presupuesto">
      <div className="sin-barra flex-1 overflow-y-auto px-6 pb-6">
        <Cabecera alVolver={alCerrar} cerrar />
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-ink">{pedido.titulo}</h1>
        <p className="mt-2 flex items-center gap-2 text-[15px] text-ink-500">
          <Icono nombre={rubro.id} size={18} className="text-ink" />
          {rubro.nombre} · {pedido.zona} · {URGENCIA[pedido.urgencia]}
          {pedido.ejemplo ? " · Ejemplo" : ""}
        </p>
        {pedido.fotoId && <img src={`/api/fotos?id=${pedido.fotoId}`} alt="Foto que mandó el vecino" className="mt-4 max-h-60 w-full rounded-[22px] object-cover" />}
        <p className="mt-4 text-base text-ink">{pedido.descripcion}</p>
        {pedido.precioMin !== null && pedido.precioMax !== null && (
          <div className="mt-5">
            <p className="text-[15px] text-ink-500">Suele costar</p>
            <p className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink">
              {pesos(pedido.precioMin)} <span className="text-ink-500">a</span> {pesos(pedido.precioMax)}
            </p>
            <p className="mt-1 text-[13px] text-ink-500">Mano de obra. Los materiales van aparte.</p>
          </div>
        )}
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

        {pedido.relato && (
          <div className="mt-4 border-l-2 border-line pl-4">
            <p className="text-[13px] font-semibold text-ink-500">Lo que dijo {pedido.clienteNombre.split(" ")[0]}</p>
            <p className="mt-1 text-[15px] italic text-ink-500">“{pedido.relato}”</p>
          </div>
        )}

        {pedido.diagnostico && (
          <div className="mt-2">
            <Diagnostico diagnostico={pedido.diagnostico} para="prestador" />
          </div>
        )}

        {pedido.yaOferte || pedido.cupos === 0 ? (
          <p className="mt-8 text-[17px] font-semibold text-ink">
            {pedido.yaOferte
              ? "Ya enviaste tu presupuesto."
              : pedido.reservadoMin > 0
                ? `El último lugar está guardado para prestadores de ${pedido.zona}. Se abre para todos en ${pedido.reservadoMin} min.`
                : "Este pedido ya recibió sus 3 presupuestos."}
          </p>
        ) : prestadorId === null ? (
          <p className="mt-8 text-[15px] text-ink-500">Para mandar tu precio primero contanos qué hacés. Es gratis y tarda un minuto.</p>
        ) : !conCuenta ? (
          <EntrarACuenta abiertoAlInicio titulo="Entrá para presupuestar" motivo="Tu perfil queda unido a tu cuenta y no lo perdés si cambiás de celular." />
        ) : (
          <>
            <label className="mt-8 block text-center">
              <span className="text-sm font-semibold text-ink-500">Tu precio</span>
              <div className="mx-auto mt-1 flex max-w-[280px] items-baseline justify-center border-b-2 border-line pb-2 focus-within:border-acento">
                <span className="cifra text-[44px] font-bold leading-none text-ink-500">$</span>
                <input
                  className="cifra w-full bg-transparent pl-1 text-center text-[60px] font-bold leading-none tracking-[-0.04em] text-ink outline-none placeholder:text-ink-500"
                  value={precio ? new Intl.NumberFormat("es-AR").format(Number(precio)) : ""}
                  onChange={(e) => setPrecio(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  placeholder="0"
                  aria-describedby="ayuda-precio"
                />
              </div>
              <span id="ayuda-precio" className="mt-2 block text-[13px] text-ink-500">
                {pedido.precioMin !== null && pedido.precioMax !== null ? `Suele costar ${pesos(pedido.precioMin)} a ${pesos(pedido.precioMax)}` : "Mano de obra. Los materiales van aparte."}
              </span>
              {lejos && <span className="mt-1 block text-sm font-medium text-ink">Está lejos de lo habitual. Contá por qué en el mensaje.</span>}
            </label>
            {rapidos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {rapidos.map((valor) => (
                  <Chip key={valor} activo={numero === valor} onClick={() => setPrecio(String(valor))}>
                    {pesos(valor)}
                  </Chip>
                ))}
              </div>
            )}

            <div className="mt-6">
              <span className="text-sm font-bold text-ink-500">Puedo ir</span>
              <div className="mt-2">
                <OfrecerTurnos dias={dias} franjas={franjas} alCambiarDias={setDias} alCambiarFranjas={setFranjas} />
              </div>
              <p className="mt-2 text-[13px] text-ink-500">
                {turnos.length === 0 ? "Marcá días y horarios." : `${turnos.length} ${turnos.length === 1 ? "horario" : "horarios"} para que el vecino elija.`}
              </p>
            </div>

            <div className="mt-6">
              <label htmlFor="mensaje-oferta" className="text-sm font-semibold text-ink">
                Mensaje para el vecino
              </label>
              <div className="mt-2 flex items-start gap-3">
                <textarea
                  id="mensaje-oferta"
                  className={`${claseCampo} min-h-24 resize-none`}
                  value={dictado.parcial ? `${mensaje} ${dictado.parcial}`.trim() : mensaje}
                  onChange={(e) => cambiarMensaje(e.target.value)}
                  readOnly={dictado.escuchando}
                  maxLength={500}
                  placeholder="Opcional. Qué incluye, cuánto tardás."
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
        <div className="border-t border-line px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {prestadorId === null ? (
            <BotonPrimario onClick={alAnotarse}>Anotarme y presupuestar</BotonPrimario>
          ) : !conCuenta ? (
            <Falta>Entrá con tu cuenta para mandar tu precio</Falta>
          ) : (
            <>
              {faltaAlgo && precio !== "" && <Falta>{faltaAlgo}</Falta>}
              <BotonPrimario onClick={enviar} disabled={!puedeEnviar} cargando={enviando}>
                Enviar presupuesto
              </BotonPrimario>
            </>
          )}
        </div>
      )}
    </div>
  );
}
