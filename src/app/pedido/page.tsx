import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { BotonFlotante, BotonPrimario, BotonSecundario, BotonTexto, Cabecera, Cargando, ErrorDePantalla, Estado, Falta, Icono, Pantalla, Titulo } from "@/components/ui";
import { Mapa } from "@/components/Mapa";
import { ElegirTurno } from "@/components/Turnos";
import { ESTADOS_DE_TRABAJO, nombreDelDia, sePuedeCancelar, sePuedeReprogramar, textoDeEstado, textoDeTurno, type EstadoDeTrabajo, type Turno } from "@/lib/turnos";
import { pesos, rubroPorId } from "@/lib/catalogo";
import { ErrorDePedido, guardarMiPedido, leerMisPedidos, pedir } from "@/lib/cliente";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { Diagnostico } from "@/components/Diagnostico";
import { PantallaCambiarDia, PantallaCancelar, PantallaReclamo } from "@/components/Gestiones";
import { PantallaChat } from "@/components/PantallaChat";
import { Estrellas, Verificacion } from "@/components/Reputacion";
import { claseCampo } from "@/components/ui";
import { frasePresupuestos } from "@/lib/frases";
import { Link, useRouter } from "@/lib/navegacion";
import type { Seguimiento } from "@/lib/seguimiento";
import type { EstadoDePago, OfertaParaCliente, PagoPublico } from "@/lib/tipos";

const TEXTO_DE_PAGO: Record<EstadoDePago, string> = {
  pendiente: "Esperando el pago",
  retenido: "Pago retenido hasta que confirmes",
  liberado: "Pago liberado",
  en_disputa: "Pago en reclamo",
  resuelto: "Reclamo del pago resuelto",
  vencido: "El pago venció",
  cancelado: "Pago cancelado",
  pagado: "Pagado",
};

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function Avatar({ nombre, size = 48, oscuro = false }: { nombre: string; size?: number; oscuro?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${oscuro ? "bg-ink text-white" : "bg-subtle text-ink"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {iniciales(nombre)}
    </span>
  );
}

// Seguimiento del pedido para el vecino: ve llegar los presupuestos, les pregunta por el chat y elige uno.
// Todo el contacto es por el chat de la app: acá nunca se muestra un teléfono.
export default function SeguimientoPedido() {
  const { id = "" } = useParams();
  const ubicacion = useLocation();
  const router = useRouter();
  const [clave, setClave] = useState<string | null>(null);
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<OfertaParaCliente | null>(null);
  // Elegir: el presupuesto marcado en la lista, y el turno y la dirección de la pantalla "¿Cuándo? ¿Dónde?".
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [turnoElegido, setTurnoElegido] = useState<Turno | null>(null);
  const [calle, setCalle] = useState("");
  const [referencia, setReferencia] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [calificando, setCalificando] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [pidiendoMuestra, setPidiendoMuestra] = useState(false);
  // Pagar o confirmar el trabajo: mientras se guarda, el botón principal muestra que está trabajando.
  const [trabajando, setTrabajando] = useState(false);
  // Gestión abierta a pantalla completa: reclamar, cambiar el día o cancelar.
  const [gestion, setGestion] = useState<"reclamo" | "dia" | "cancelar" | null>(null);
  // El presupuesto cuyo chat está abierto, si hay alguno.
  const [chat, setChat] = useState<OfertaParaCliente | null>(null);
  // Cada cambio hecho desde esta pantalla sube el contador: una consulta automática que salió antes
  // y vuelve después no pisa lo que se acaba de guardar.
  const cambios = useRef(0);

  // La clave sale de este celular o, si abrieron el enlace en otro, de lo que viene después del #.
  useEffect(() => {
    const guardado = leerMisPedidos().find((p) => p.id === id);
    const delEnlace = ubicacion.hash.replace(/^#/, "");
    setClave(guardado?.clave ?? (delEnlace || ""));
  }, [id, ubicacion.hash]);

  const cargar = useCallback(async () => {
    if (!clave) return;
    const alSalir = cambios.current;
    try {
      const respuesta = await pedir<Seguimiento>(`/api/pedido?id=${encodeURIComponent(id)}&clave=${encodeURIComponent(clave)}`);
      if (alSalir !== cambios.current) return;
      setDatos(respuesta);
      setError("");
      guardarMiPedido({ id, clave, titulo: respuesta.pedido.titulo, creado: respuesta.pedido.creado });
      // Si hay un pago en curso se pregunta su estado a Cosmos (por si el aviso todavía no llegó).
      const pagoEnCurso = respuesta.ofertas.find((o) => o.estado === "elegida")?.pago;
      if (pagoEnCurso && (pagoEnCurso.estado === "pendiente" || pagoEnCurso.estado === "retenido" || !pagoEnCurso.comisionPagada)) {
        const actual = await pedir<{ pago: PagoPublico | null }>(`/api/pagos?id=${encodeURIComponent(id)}&clave=${encodeURIComponent(clave)}`).catch(() => null);
        if (actual?.pago && alSalir === cambios.current) {
          setDatos({ ...respuesta, ofertas: respuesta.ofertas.map((o) => (o.estado === "elegida" ? { ...o, pago: actual.pago } : o)) });
        }
      }
    } catch (e) {
      if (e instanceof ErrorDePedido && (e.estado === 403 || e.estado === 404)) setError(e.message);
      else setError("Sin conexión. Seguimos intentando.");
    }
  }, [id, clave]);

  const tituloDelPedido = datos?.pedido.titulo;
  useEffect(() => {
    if (tituloDelPedido) document.title = `${tituloDelPedido} · NecesitoYa`;
  }, [tituloDelPedido]);

  const abierto = datos?.pedido.estado !== "cerrado";
  useEffect(() => {
    cargar();
    // Con el pedido cerrado se sigue consultando, más espaciado: así aparece el aviso de mensaje nuevo.
    const reloj = setInterval(cargar, abierto ? 8_000 : 12_000);
    return () => clearInterval(reloj);
  }, [cargar, abierto]);

  async function elegir(oferta: OfertaParaCliente, turno: Turno | null) {
    if (!clave) return;
    setEligiendo(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/elegir", {
        method: "POST",
        body: JSON.stringify({ id, clave, ofertaId: oferta.id, turno, direccion: { calle, referencia } }),
      });
      cambios.current += 1;
      setDatos(respuesta);
      setPorConfirmar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu elección. Probá de nuevo.");
    } finally {
      setEligiendo(false);
    }
  }

  async function calificar() {
    if (!clave || estrellas < 1) return;
    setEnviandoNota(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/calificar", {
        method: "POST",
        body: JSON.stringify({ id, clave, estrellas, comentario }),
      });
      cambios.current += 1;
      setDatos(respuesta);
      setCalificando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu calificación. Probá de nuevo.");
    } finally {
      setEnviandoNota(false);
    }
  }

  // La página de pago de Cosmos se abre en otra pestaña. Se abre en el mismo toque (si no, el celular la bloquea).
  function abrirPago(url: string, ventana?: Window | null) {
    if (!url) return;
    if (ventana) ventana.location.href = url;
    else if (!window.open(url, "_blank", "noopener")) window.location.href = url;
  }

  async function pagar() {
    if (!clave) return;
    const existente = datos?.ofertas.find((o) => o.estado === "elegida")?.pago;
    if (existente?.urlDePago) return abrirPago(existente.urlDePago);
    const ventana = window.open("", "_blank");
    setTrabajando(true);
    setError("");
    try {
      const respuesta = await pedir<{ pago: PagoPublico }>("/api/pagos", { method: "POST", body: JSON.stringify({ id, clave }), espera: 40_000 });
      cambios.current += 1;
      abrirPago(respuesta.pago.urlDePago, ventana);
      setDatos((previos) => previos && { ...previos, ofertas: previos.ofertas.map((o) => (o.estado === "elegida" ? { ...o, pago: respuesta.pago } : o)) });
    } catch (e) {
      ventana?.close();
      setError(e instanceof Error ? e.message : "No pudimos armar el pago. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar() {
    if (!clave) return;
    setTrabajando(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/confirmar", { method: "POST", body: JSON.stringify({ id, clave }) });
      cambios.current += 1;
      setDatos(respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la confirmación. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  async function verMuestra() {
    if (!clave) return;
    setPidiendoMuestra(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/muestra", { method: "POST", body: JSON.stringify({ id, clave }) });
      cambios.current += 1;
      setDatos(respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar los presupuestos de muestra. Probá de nuevo.");
    } finally {
      setPidiendoMuestra(false);
    }
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pedido/${id}#${clave}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No pudimos copiar el enlace.");
    }
  }

  if (clave === "") {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/")}>Ir al inicio</BotonPrimario>}>
        <Cabecera volver="/" />
        <Titulo pregunta="Abrilo desde el celular donde lo publicaste, o con el enlace que copiaste.">No encontramos tu pedido</Titulo>
      </Pantalla>
    );
  }

  if (!datos) {
    if (!error) return <Cargando />;
    return (
      <Pantalla>
        <Cabecera volver="/" />
        <ErrorDePantalla>{error}</ErrorDePantalla>
      </Pantalla>
    );
  }

  const { pedido, ofertas, maximo } = datos;
  const rubro = rubroPorId(pedido.rubro);
  const elegida = ofertas.find((o) => o.estado === "elegida");
  const pantallaDeChat =
    chat && clave ? (
      <PantallaChat
        ofertaId={chat.id}
        quien={{ pedidoId: id, clave }}
        nombre={chat.prestador.nombre.split(" ")[0]}
        titulo={pedido.titulo}
        alCerrar={() => {
          setChat(null);
          cargar();
        }}
      />
    ) : null;

  if (gestion === "cancelar" && clave) {
    return (
      <PantallaCancelar
        pedidoId={id}
        clave={clave}
        alCerrar={(cancelado) => {
          setGestion(null);
          if (cancelado) {
            cambios.current += 1;
            cargar();
          }
        }}
      />
    );
  }

  if (pedido.estado === "cancelado") {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/")}>Ir al inicio</BotonPrimario>}>
        <Cabecera volver="/" />
        <Titulo pregunta={pedido.cancelacion?.motivo ? `Motivo: ${pedido.cancelacion.motivo.toLowerCase()}.` : undefined}>Pedido cancelado</Titulo>
        <p className="mt-6 text-base font-semibold text-ink">{pedido.titulo}</p>
        <p className="mt-1 text-[15px] text-ink-500">Los prestadores ya no lo ven.</p>
      </Pantalla>
    );
  }

  // Día, franja y dirección: el vecino elige entre los turnos que ofreció el prestador y carga dónde es.
  // La dirección es privada: solo la ve el prestador elegido, mientras el trabajo está activo.
  if (porConfirmar) {
    const pila = porConfirmar.prestador.nombre.split(" ")[0];
    const muestra = porConfirmar.prestador.ejemplo;
    const turnos = porConfirmar.turnos ?? [];
    const turno = turnoElegido ?? turnos[0] ?? null;
    const faltaDireccion = !muestra && calle.trim().length < 4;
    return (
      <Pantalla
        mapa={
          <Mapa alto={170} variante="destino">
            <BotonFlotante icono="atras" etiqueta="Volver a los presupuestos" onClick={() => setPorConfirmar(null)} />
          </Mapa>
        }
        pie={
          <>
            {faltaDireccion && <Falta>Falta la dirección</Falta>}
            <BotonPrimario onClick={() => elegir(porConfirmar, turno)} disabled={faltaDireccion} cargando={eligiendo}>
              {turno ? textoDeTurno(turno) : `Elegir a ${pila}`}
              <Icono nombre="flecha" size={22} />
            </BotonPrimario>
          </>
        }
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Cuándo?</h1>
        <p className="mt-1 text-[15px] text-ink-500">
          {pila} · <span className="cifra font-bold text-ink">{pesos(porConfirmar.precio)}</span>
        </p>
        <div className="mt-4">
          {turnos.length > 0 ? (
            <ElegirTurno turnos={turnos} valor={turno} alCambiar={setTurnoElegido} />
          ) : (
            <p className="text-[15px] text-ink-500">Lo coordinan por la app después de elegir.</p>
          )}
        </div>

        <div className="my-6 h-px bg-line" />

        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Dónde?</h2>
        <label className="mt-4 block">
          <span className="sr-only">Calle y número</span>
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-subtle">
              <Icono nombre="casa" size={22} />
            </span>
            <input
              className={claseCampo}
              value={calle}
              onChange={(e) => setCalle(e.target.value)}
              placeholder="Calle y número"
              autoComplete="street-address"
              maxLength={120}
            />
          </span>
        </label>
        <label className="mt-3 block">
          <span className="sr-only">Cómo encontrar la casa</span>
          <input className={claseCampo} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Piso, timbre o color de la casa (opcional)" maxLength={120} />
        </label>
        <p className="mt-3 inline-flex min-h-10 items-center gap-2 self-start rounded-xl bg-subtle px-3.5 text-sm font-semibold text-ink">
          <Icono nombre="candado" size={16} />
          Solo la ve {pila}, hasta que termine
        </p>
        {porConfirmar.prestador.pagoProtegido && <p className="mt-4 text-[15px] text-ink-500">Después pagás protegido: la plata queda retenida hasta que confirmes.</p>}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // Calificar: después del trabajo, las estrellas y un comentario opcional.
  if (elegida && calificando) {
    const pila = elegida.prestador.nombre.split(" ")[0];
    return (
      <Pantalla
        pie={
          <BotonPrimario onClick={calificar} disabled={estrellas < 1} cargando={enviandoNota}>
            Enviar calificación
          </BotonPrimario>
        }
      >
        <Cabecera alVolver={() => setCalificando(false)} cerrar />
        <Titulo pregunta="Le sirve a otros vecinos.">¿Cómo trabajó {pila}?</Titulo>
        <div className="mt-8">
          <Estrellas valor={estrellas} alElegir={setEstrellas} />
        </div>
        <label className="mt-8 block">
          <span className="text-sm font-semibold text-ink">Contá cómo te fue</span>
          <textarea
            className={`${claseCampo} mt-2 min-h-28 resize-none`}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={300}
            placeholder="Opcional. Si llegó a horario, si quedó bien."
          />
        </label>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // Seguimiento en vivo del trabajo elegido: el estado grande, la línea de tiempo, el turno, el pago y una sola
  // acción grande (la que toca ahora). Reprogramar, cancelar, reclamar y el chat quedan como acciones secundarias.
  if (elegida) {
    const pila = elegida.prestador.nombre.split(" ")[0];
    const pago = elegida.pago;
    const muestra = elegida.prestador.ejemplo;
    const trabajo = elegida.trabajo;
    const estado: EstadoDeTrabajo = pedido.confirmado ? "terminado" : (trabajo?.estado ?? "confirmado");
    const puedePagar = datos.pagos && elegida.prestador.cobraPorLaApp && !muestra;
    const terminado = elegida.terminado;
    const confirmado = Boolean(pedido.confirmado);
    const porLiberar = confirmado && pago?.modo === "protegido" && pago.estado === "retenido";
    // Protegido: se paga antes (la plata queda retenida). Directo: se paga cuando el vecino confirma que quedó bien.
    const protegido = elegida.prestador.pagoProtegido;
    const porPagar = puedePagar && (!pago || pago.estado === "pendiente") && (protegido ? !confirmado && !terminado : confirmado);
    const porConfirmarTrabajo = !confirmado && (Boolean(terminado) || muestra);

    let principal: { texto: string; accion: () => void } | null = null;
    if (porLiberar) principal = { texto: "Liberar el pago", accion: () => abrirPago(pago.urlDePago) };
    else if (porConfirmarTrabajo) principal = { texto: "Quedó bien", accion: confirmar };
    else if (porPagar && confirmado) principal = { texto: pago ? "Terminar el pago" : `Pagarle a ${pila}`, accion: pagar };
    else if (confirmado && !pedido.calificacion) principal = { texto: `Calificar a ${pila}`, accion: () => setCalificando(true) };
    else if (porPagar) principal = { texto: pago ? "Terminar el pago" : protegido ? "Pagar protegido" : "Pagar por la app", accion: pagar };

    const titulo = confirmado ? "Listo" : terminado ? "Terminó" : muestra ? "De muestra" : textoDeEstado(estado);
    const pasos = ESTADOS_DE_TRABAJO.filter((e) => e.id !== "confirmado");
    const indice = pasos.findIndex((e) => e.id === estado);
    const progreso = estado === "confirmado" ? 0 : estado === "en_camino" ? 0.5 : 1;
    const activo = !confirmado && !terminado && !muestra;
    const reprogramable = activo && sePuedeReprogramar(trabajo?.estado ?? "confirmado");
    const cancelable = activo && sePuedeCancelar(trabajo?.estado ?? "confirmado") && (!pago || pago.estado === "pendiente");

    return (
      <>
        <Pantalla
          mapa={
            <Mapa alto={terminado?.fotoId ? 150 : 230} variante={estado === "confirmado" || confirmado || terminado ? "destino" : "ruta"} progreso={progreso} iniciales={iniciales(elegida.prestador.nombre)}>
              <BotonFlotante icono="atras" etiqueta="Volver al inicio" href="/" />
              {activo && estado !== "confirmado" && (
                <span className="flex h-12 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink shadow-[0_4px_14px_rgba(0,0,0,0.14)]">
                  <span className="latido h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                  En vivo
                </span>
              )}
            </Mapa>
          }
          pie={
            principal || !muestra ? (
              <>
                {!muestra && elegida.sinLeer > 0 && (
                  <p className="mb-2 text-center">
                    <Estado tono="bien">Mensaje nuevo de {pila}</Estado>
                  </p>
                )}
                {principal ? (
                  <BotonPrimario onClick={principal.accion} cargando={trabajando}>
                    {principal.texto}
                  </BotonPrimario>
                ) : (
                  <BotonSecundario onClick={() => setChat(elegida)}>
                    <Icono nombre="mensaje" size={20} />
                    Mandar un mensaje
                  </BotonSecundario>
                )}
              </>
            ) : undefined
          }
        >
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[34px] font-bold leading-none tracking-[-0.03em] text-ink">{titulo}</h1>
            {trabajo?.turno && !confirmado && <span className="cifra text-right text-[17px] font-bold text-ink">{textoDeTurno(trabajo.turno)}</span>}
          </div>

          {!muestra && (
            <div className="mt-4" role="img" aria-label={`Estado del trabajo: ${textoDeEstado(estado)}`}>
              <div className="grid grid-cols-4 gap-1.5">
                {pasos.map((paso, i) => (
                  <span key={paso.id} className={`h-1.5 rounded-full ${i <= indice ? "bg-acento" : "bg-line"}`} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs font-bold">
                {pasos.map((paso, i) => (
                  <span key={paso.id} className={i <= indice ? "text-ink" : "text-ink-500"}>
                    {paso.texto}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Avatar nombre={elegida.prestador.nombre} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-ink">{elegida.prestador.nombre}</p>
              {!muestra && <Verificacion nivel={elegida.prestador.nivel} />}
            </div>
            <span className="cifra flex h-9 items-center gap-1.5 rounded-lg bg-subtle px-2.5 text-sm font-bold text-ink">
              {pago && pago.estado !== "pendiente" && <Icono nombre="escudo" size={14} />}
              {pesos(elegida.precio)}
            </span>
          </div>

          {terminado?.fotoId && (
            <figure className="mt-5">
              <img src={`/api/fotos?id=${terminado.fotoId}`} alt={`Cómo quedó el trabajo, según ${pila}`} className="max-h-64 w-full rounded-[22px] object-cover" />
              <figcaption className="mt-2 text-[13px] text-ink-500">La foto del después.</figcaption>
            </figure>
          )}

          <div className="mt-4 space-y-2">
            {muestra && <p className="text-[15px] text-ink-500">Era de muestra. Con un prestador real, acá ves el trabajo en vivo.</p>}
            {datos.direccion && activo && (
              <p className="flex items-center gap-2 text-[15px] text-ink">
                <Icono nombre="candado" size={16} />
                <span>
                  {datos.direccion.calle}
                  <span className="text-ink-500"> · solo la ve {pila}</span>
                </span>
              </p>
            )}
            {pago && (
              <p>
                <Estado tono={pago.estado === "en_disputa" || pago.estado === "vencido" ? "mal" : pago.estado === "pendiente" ? "neutro" : "bien"}>
                  {TEXTO_DE_PAGO[pago.estado]} · {pago.moneda === "USDC" ? `${pago.monto} USDC` : pesos(Number(pago.monto))}
                </Estado>
              </p>
            )}
            {!pago && !muestra && !confirmado && !puedePagar && (
              <p>
                <Estado>Sin pago por la app: arreglen por el chat</Estado>
              </p>
            )}
            {porLiberar && <p className="text-[15px] text-ink-500">Se abre Cosmos Pay: aprobá y liberá con tu billetera.</p>}
            {porPagar && (
              <p className="text-[15px] text-ink-500">
                {protegido ? "Queda retenido hasta que confirmes." : `Le llega a ${pila} en el momento.`} Comisión fija de NecesitoYa
                {pago ? `: ${pago.moneda === "USDC" ? `${pago.comision} USDC` : pesos(Number(pago.comision))}` : " aparte"}.
              </p>
            )}
            {pago?.urlDeComision && !pago.comisionPagada && pago.estado !== "pendiente" && (
              <button type="button" onClick={() => abrirPago(pago.urlDeComision ?? "")} className="flex min-h-12 items-center text-base font-semibold text-ink underline underline-offset-2">
                Pagar la comisión ({pago.comision} USDC)
              </button>
            )}
            {datos.reclamos.map((r) => (
              <p key={r.creado}>
                {r.estado === "abierto" ? <Estado tono="mal">Reclamo en revisión: {r.motivo.toLowerCase()}</Estado> : <Estado>Reclamo resuelto: {r.resolucion}</Estado>}
              </p>
            ))}
            {pedido.calificacion && (
              <p className="flex items-center gap-2">
                <Estrellas valor={pedido.calificacion.estrellas} size={18} />
                <span className="text-[15px] text-ink-500">Gracias por calificar.</span>
              </p>
            )}
          </div>

          {!muestra && (
            <div className="mt-5 divide-y divide-line border-t border-line">
              {principal && (
                <AccionSecundaria texto="Mandar un mensaje" icono="mensaje" onClick={() => setChat(elegida)} aviso={elegida.sinLeer > 0} />
              )}
              {reprogramable && <AccionSecundaria texto="Reprogramar" icono="reloj" onClick={() => setGestion("dia")} />}
              {porLiberar && !pedido.calificacion && <AccionSecundaria texto={`Calificar a ${pila}`} icono="estrella" onClick={() => setCalificando(true)} />}
              <AccionSecundaria texto="Tengo un problema" icono="bandeja" onClick={() => setGestion("reclamo")} />
              {cancelable && <AccionSecundaria texto="Cancelar" icono="cerrar" onClick={() => setGestion("cancelar")} peligro />}
            </div>
          )}
          {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
        </Pantalla>
        {pantallaDeChat}
        {gestion === "reclamo" && clave && (
          <PantallaReclamo
            ofertaId={elegida.id}
            quien={{ pedidoId: id, clave }}
            nombre={pila}
            alCerrar={(enviado) => {
              setGestion(null);
              if (enviado) cargar();
            }}
          />
        )}
        {gestion === "dia" && clave && (
          <PantallaCambiarDia
            ofertaId={elegida.id}
            quien={{ pedidoId: id, clave }}
            actual={elegida.cuando}
            turnos={elegida.turnos ?? []}
            alCerrar={(nuevo) => {
              setGestion(null);
              if (nuevo) cargar();
            }}
          />
        )}
      </>
    );
  }

  // Presupuestos: tarjetas para elegir, con el precio grande. Arriba, el mapa con los precios.
  const reales = ofertas.filter((o) => !o.prestador.ejemplo).length;
  const marcada = ofertas.find((o) => o.id === seleccionada) ?? ofertas[0];
  return (
    <>
      <Pantalla
        mapa={
          <Mapa alto={ofertas.length > 0 ? 200 : 160} variante="inicio" etiqueta={pedido.zona} marcas={ofertas.map((o) => ({ texto: `$${Math.round(o.precio / 1000)}k`, acento: o.id === marcada?.id }))}>
            <BotonFlotante icono="atras" etiqueta="Volver al inicio" href="/" />
          </Mapa>
        }
        pie={
          marcada ? (
            <BotonPrimario onClick={() => setPorConfirmar(marcada)}>Elegir a {marcada.prestador.nombre.split(" ")[0]}</BotonPrimario>
          ) : undefined
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{ofertas.length > 0 ? "Elegí presupuesto" : "Buscando"}</h1>
          <span className="shrink-0 text-sm font-semibold text-ink-500">
            {reales} de {maximo}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-2 text-[15px] text-ink-500">
          <Icono nombre={rubro.id} size={16} className="text-ink" />
          <span className="truncate">{pedido.titulo}</span>
        </p>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {ofertas.length === 0 ? (
          <div className="mt-6">
            <p className="flex items-center gap-2 text-base font-semibold text-ink">
              <span className="latido h-2.5 w-2.5 rounded-full bg-acento" aria-hidden="true" />
              Avisamos a los de {pedido.zona}
            </p>
            <p className="mt-1 text-[15px] text-ink-500">Los presupuestos aparecen acá solos.</p>
            {pedido.precioMin !== null && pedido.precioMax !== null && (
              <p className="mt-4 text-[15px] text-ink-500">
                Suele costar{" "}
                <span className="cifra font-bold text-ink">
                  {pesos(pedido.precioMin)} a {pesos(pedido.precioMax)}
                </span>
              </p>
            )}
            <ActivarAvisos para="¿Te avisamos cuando llegue uno?" />
            <div className="mt-4">
              <BotonSecundario onClick={verMuestra} disabled={pidiendoMuestra}>
                {pidiendoMuestra ? "Cargando" : "Ver presupuestos de muestra"}
              </BotonSecundario>
              <p className="mt-2 text-[13px] text-ink-500">Para probar cómo se ve. Son inventados.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3">
              <BotonEscuchar texto={frasePresupuestos(ofertas)} />
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {ofertas.map((oferta) => {
                const activa = oferta.id === marcada?.id;
                const pila = oferta.prestador.nombre.split(" ")[0];
                const proximo = oferta.turnos?.[0];
                return (
                  <li key={oferta.id} className="entrar">
                    <button
                      type="button"
                      aria-pressed={activa}
                      onClick={() => setSeleccionada(oferta.id)}
                      className={`flex w-full items-center gap-3 rounded-[18px] bg-white p-3.5 text-left ${activa ? "border-2 border-ink" : "border border-line"}`}
                    >
                      <Avatar nombre={oferta.prestador.nombre} oscuro={activa} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[17px] font-bold text-ink">{oferta.prestador.nombre}</span>
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-bold">
                          {oferta.prestador.ejemplo ? <Estado>De muestra</Estado> : <Verificacion nivel={oferta.prestador.nivel} />}
                          {oferta.prestador.reputacion.promedio !== null && (
                            <span className="inline-flex items-center gap-1 text-ink">
                              <Icono nombre="estrella" size={13} />
                              {oferta.prestador.reputacion.promedio.toFixed(1).replace(".", ",")}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="cifra text-[22px] font-bold leading-none tracking-[-0.02em] text-ink">{pesos(oferta.precio)}</span>
                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                          {proximo && nombreDelDia(proximo.dia) === "Hoy" && <span className="h-2 w-2 rounded-full bg-acento" aria-hidden="true" />}
                          {proximo ? (nombreDelDia(proximo.dia) === "Hoy" ? "Llega hoy" : nombreDelDia(proximo.dia)) : oferta.cuando}
                        </span>
                      </span>
                    </button>
                    {activa && (
                      <div className="px-2 pb-1 pt-3">
                        {oferta.mensaje && <p className="text-[15px] text-ink-500">“{oferta.mensaje}”</p>}
                        {oferta.prestador.fotos.length > 0 && (
                          <div className="mt-3 flex gap-2">
                            {oferta.prestador.fotos.map((fotoId) => (
                              <img key={fotoId} src={`/api/fotos?id=${fotoId}`} alt={`Trabajo de ${pila}`} loading="lazy" className="h-16 w-16 rounded-xl object-cover" />
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-5">
                          <Link href={`/p/${oferta.prestador.id}`} className="flex min-h-12 items-center text-[15px] font-semibold text-ink underline underline-offset-2">
                            Ver perfil
                          </Link>
                          {!oferta.prestador.ejemplo && (
                            <button type="button" onClick={() => setChat(oferta)} className="flex min-h-12 items-center gap-2 text-[15px] font-semibold text-ink underline underline-offset-2">
                              Mandar un mensaje
                              {oferta.sinLeer > 0 && <Estado tono="bien">Nuevo</Estado>}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {ofertas.some((o) => o.prestador.pagoProtegido) && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-500">
                <Icono nombre="escudo" size={18} />
                Pago protegido por la app
              </p>
            )}
          </>
        )}

        {pedido.diagnostico && <Diagnostico diagnostico={pedido.diagnostico} />}

        <div className="mt-8">
          <BotonSecundario onClick={copiarEnlace}>
            <Icono nombre={copiado ? "check" : "enlace"} size={20} />
            {copiado ? "Enlace copiado" : "Copiar enlace del pedido"}
          </BotonSecundario>
          <BotonTexto onClick={() => setGestion("cancelar")}>Cancelar el pedido</BotonTexto>
        </div>
      </Pantalla>
      {pantallaDeChat}
    </>
  );
}

function AccionSecundaria({ texto, icono, onClick, aviso = false, peligro = false }: { texto: string; icono: string; onClick: () => void; aviso?: boolean; peligro?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-14 w-full items-center gap-3 text-left text-base font-semibold ${peligro ? "text-danger" : "text-ink"}`}>
      <Icono nombre={icono} size={20} />
      <span className="flex-1">{texto}</span>
      {aviso && <Estado tono="bien">Nuevo</Estado>}
      <Icono nombre="chevron" size={20} className="text-ink-400" />
    </button>
  );
}
