import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";
import { BotonFlotante, BotonPrimario, BotonRedondo, BotonSecundario, Cabecera, Cargando, ErrorDePantalla, Estado, Falta, Icono, Pantalla, Pildora, PildoraFlotante, Titulo } from "@/components/ui";
import { Avatar, iniciales } from "@/components/Avatar";
import { BarraDeEstados } from "@/components/EstadosDeTrabajo";
import { HojaDeAbajo } from "@/components/Hoja";
import { Mapa } from "@/components/Mapa";
import { ElegirTurno } from "@/components/Turnos";
import { nombreDelDia, sePuedeCancelar, sePuedeReprogramar, textoDeEstado, textoDeTurno, type EstadoDeTrabajo, type Turno } from "@/lib/turnos";
import { pesos, rubroPorId } from "@/lib/catalogo";
import { ErrorDePedido, guardarMiPedido, leerMisPedidos, pedir } from "@/lib/cliente";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { Diagnostico } from "@/components/Diagnostico";
import { PantallaCambiarDia, PantallaCancelar, PantallaReclamo } from "@/components/Gestiones";
import { PantallaChat } from "@/components/PantallaChat";
import { Estrellas } from "@/components/Reputacion";
import { claseCampo } from "@/components/ui";
import { frasePresupuestos } from "@/lib/frases";
import { Link, useRouter } from "@/lib/navegacion";
import type { Seguimiento } from "@/lib/seguimiento";
import type { EstadoDePago, OfertaParaCliente, PagoPublico, Urgencia } from "@/lib/tipos";

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

const URGENCIA: Record<Urgencia, string> = { hoy: "Para hoy", semana: "Esta semana", flexible: "Sin apuro" };

const pilaDe = (nombre: string) => nombre.split(" ")[0];

// "$78k" para el pin del mapa.
const precioCorto = (precio: number) => `$${Math.round(precio / 1000)}k`;

// Cuándo puede ir: el primer turno que ofreció ("Hoy 13–17 h") o lo que escribió.
function cuandoPuede(oferta: OfertaParaCliente) {
  const primero = oferta.turnos?.[0];
  return primero ? textoDeTurno(primero).replace(" · ", " ") : oferta.cuando;
}

// Una etiqueta por presupuesto, como en "Elegí un viaje": verde para el más barato; neutras para lo demás.
function etiquetaDe(oferta: OfertaParaCliente, ofertas: OfertaParaCliente[]): { texto: string; bien: boolean } | null {
  if (oferta.prestador.ejemplo) return { texto: "De muestra", bien: false };
  const minimo = Math.min(...ofertas.map((o) => o.precio));
  if (ofertas.length > 1 && oferta.precio === minimo && ofertas.filter((o) => o.precio === minimo).length === 1) return { texto: "Más barato", bien: true };
  const primero = oferta.turnos?.[0];
  if (primero && nombreDelDia(primero.dia) === "Hoy") return { texto: "Llega hoy", bien: false };
  if (oferta.prestador.nivel >= 3) return { texto: "Matriculado", bien: false };
  return null;
}

// Cómo se paga, dicho para el vecino. `puedePagar` = el servidor cobra por la app y el prestador también.
function explicacionDePago(oferta: OfertaParaCliente, puedePagar: boolean) {
  const pila = pilaDe(oferta.prestador.nombre);
  if (!puedePagar) return { titulo: "Pago a coordinar", texto: `${pila} todavía no cobra por la app. El pago lo arreglan por el chat, sin compartir teléfonos.` };
  if (oferta.prestador.pagoProtegido) {
    return { titulo: "Pago protegido por la app", texto: `Pagás por la app y la plata queda retenida hasta que confirmes que quedó bien. Recién ahí le llega a ${pila}. La comisión de NecesitoYa va aparte.` };
  }
  return { titulo: "Pago por la app", texto: `Pagás por la app cuando confirmás que quedó bien, y le llega a ${pila} en el momento. La comisión de NecesitoYa va aparte.` };
}

// Seguimiento del pedido para el vecino: ve llegar los presupuestos, les pregunta por el chat y elige uno.
// Después sigue el trabajo en vivo. Todo el contacto es por el chat de la app: acá nunca se muestra un teléfono.
export default function SeguimientoPedido() {
  const { id = "" } = useParams();
  const ubicacion = useLocation();
  const router = useRouter();
  const [clave, setClave] = useState<string | null>(null);
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<OfertaParaCliente | null>(null);
  // Elegir: el presupuesto marcado en la lista, y el turno y la dirección del paso "Día y dirección".
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
  // La hoja que explica cómo se paga.
  const [infoDePago, setInfoDePago] = useState(false);
  // Pagar o confirmar el trabajo: mientras se guarda, el botón principal muestra que está trabajando.
  const [trabajando, setTrabajando] = useState(false);
  // Si el sistema de pagos frena el pedido un momento, se avisa y se vuelve a probar solo (no se muestra un error).
  const [preparando, setPreparando] = useState(false);
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
      // Hasta unos 3 minutos: si Cosmos frena el pedido de paso, el servidor responde "preparando" y se vuelve a pedir.
      for (let intento = 0; ; intento++) {
        const respuesta = await pedir<{ pago?: PagoPublico; preparando?: boolean }>("/api/pagos", { method: "POST", body: JSON.stringify({ id, clave }), espera: 40_000 });
        if (respuesta.pago) {
          const pago = respuesta.pago;
          cambios.current += 1;
          abrirPago(pago.urlDePago, ventana);
          setDatos((previos) => previos && { ...previos, ofertas: previos.ofertas.map((o) => (o.estado === "elegida" ? { ...o, pago } : o)) });
          return;
        }
        if (!respuesta.preparando || intento >= 11) throw new Error("El pago está tardando más de lo normal. Probá de nuevo en unos minutos.");
        setPreparando(true);
        if (ventana && !ventana.closed) {
          try {
            ventana.document.title = "Preparando tu pago";
            ventana.document.body.innerHTML = '<p style="font:18px system-ui;padding:24px">Estamos preparando tu pago. Esta pestaña se abre sola en un momento.</p>';
          } catch {
            // Si el navegador no deja escribir en la pestaña, se sigue igual.
          }
        }
        await new Promise((listo) => setTimeout(listo, 5_000));
      }
    } catch (e) {
      ventana?.close();
      setError(e instanceof Error ? e.message : "No pudimos armar el pago. Probá de nuevo.");
    } finally {
      setTrabajando(false);
      setPreparando(false);
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
        nombre={pilaDe(chat.prestador.nombre)}
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

  // Arriba del mapa, en los presupuestos: volver y una píldora con el pedido.
  const sobreElMapa = (alVolver?: () => void) => (
    <div className="flex min-w-0 items-center gap-3">
      {alVolver ? <BotonFlotante icono="atras" etiqueta="Volver a los presupuestos" onClick={alVolver} /> : <BotonFlotante icono="atras" etiqueta="Volver al inicio" href="/" />}
      <span className="min-w-0 rounded-[22px] bg-flota px-4 py-2 text-sm leading-tight text-ink shadow-[var(--sombra-flota)]">
        <span className="block truncate font-bold">{pedido.titulo}</span>
        <span className="block truncate text-ink-500">
          {pedido.zona} · {URGENCIA[pedido.urgencia]}
        </span>
      </span>
    </div>
  );
  const marcada = ofertas.find((o) => o.id === seleccionada) ?? ofertas[0];
  const marcasDelMapa = (elegido?: OfertaParaCliente) => ofertas.map((o) => ({ texto: precioCorto(o.precio), acento: o.id === elegido?.id }));

  // Día, franja y dirección: el vecino elige entre los turnos que ofreció el prestador y carga dónde es.
  // Es la misma hoja de los presupuestos, un paso más. La dirección es privada: solo la ve el prestador elegido,
  // mientras el trabajo está activo.
  if (porConfirmar) {
    const pila = pilaDe(porConfirmar.prestador.nombre);
    const muestra = porConfirmar.prestador.ejemplo;
    const turnos = porConfirmar.turnos ?? [];
    const turno = turnoElegido ?? turnos[0] ?? null;
    const faltaDireccion = !muestra && calle.trim().length < 4;
    return (
      <Pantalla
        mapa={
          <Mapa alto={290} variante="inicio" etiqueta={pedido.zona} marcas={marcasDelMapa(porConfirmar)}>
            {sobreElMapa(() => setPorConfirmar(null))}
          </Mapa>
        }
        bordePie
        pie={
          <>
            {faltaDireccion && <Falta>Falta la dirección</Falta>}
            <BotonPrimario onClick={() => elegir(porConfirmar, turno)} disabled={faltaDireccion} cargando={eligiendo}>
              {turno ? `Confirmar: ${textoDeTurno(turno)}` : `Elegir a ${pila}`}
            </BotonPrimario>
          </>
        }
      >
        <h1 className="text-center text-[21px] font-bold tracking-[-0.01em] text-ink">Día y dirección</h1>
        <p className="mt-0.5 text-center text-sm text-ink-500">
          {porConfirmar.prestador.nombre} · <span className="cifra font-bold text-ink">{pesos(porConfirmar.precio)}</span>
        </p>

        <h2 className="mt-5 text-lg font-bold text-ink">¿Cuándo?</h2>
        <div className="mt-2.5">
          {turnos.length > 0 ? (
            <ElegirTurno turnos={turnos} valor={turno} alCambiar={setTurnoElegido} />
          ) : (
            <p className="text-[15px] text-ink-500">Lo coordinan por la app después de elegir.</p>
          )}
        </div>

        <h2 className="mt-6 text-lg font-bold text-ink">¿Dónde?</h2>
        <label className="mt-2.5 block">
          <span className="sr-only">Calle y número</span>
          <input className={claseCampo} value={calle} onChange={(e) => setCalle(e.target.value)} placeholder="Calle y número" autoComplete="street-address" maxLength={120} />
        </label>
        <label className="mt-2 block">
          <span className="sr-only">Cómo encontrar la casa</span>
          <input className={claseCampo} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Piso, timbre o color de la casa (opcional)" maxLength={120} />
        </label>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Icono nombre="candado" size={16} />
          Solo la ve {pila}, hasta que termine
        </p>
        {porConfirmar.prestador.pagoProtegido && <p className="mt-3 text-[15px] text-ink-500">Después pagás protegido: la plata queda retenida hasta que confirmes.</p>}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // Calificar: después del trabajo, las estrellas y un comentario opcional.
  if (elegida && calificando) {
    const pila = pilaDe(elegida.prestador.nombre);
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

  // En camino: el seguimiento en vivo del trabajo elegido, como un viaje. El estado grande, la barra de estados,
  // el prestador con su precio, los botones redondos (mensaje, cambiar día, problema, cancelar), la dirección
  // privada y el pago. Abajo, la acción que toca ahora o el campo para mandarle un mensaje.
  if (elegida) {
    const pila = pilaDe(elegida.prestador.nombre);
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

    const titulo = confirmado ? "Listo" : terminado ? "Terminó" : muestra ? "De muestra" : estado === "confirmado" ? "Confirmado" : textoDeEstado(estado);
    const progreso = estado === "confirmado" ? 0 : estado === "en_camino" ? 0.5 : 1;
    const activo = !confirmado && !terminado && !muestra;
    const enVivo = activo && estado !== "confirmado";
    const reprogramable = activo && sePuedeReprogramar(trabajo?.estado ?? "confirmado");
    const cancelable = activo && sePuedeCancelar(trabajo?.estado ?? "confirmado") && (!pago || pago.estado === "pendiente");
    const verificado = elegida.prestador.nivel >= 2;
    const acciones = [
      { icono: "mensaje", texto: "Mensaje", onClick: () => setChat(elegida), aviso: elegida.sinLeer > 0 },
      ...(reprogramable ? [{ icono: "calendario", texto: "Cambiar día", onClick: () => setGestion("dia") }] : []),
      { icono: "alerta", texto: "Problema", onClick: () => setGestion("reclamo") },
      ...(cancelable ? [{ icono: "cerrar", texto: "Cancelar", onClick: () => setGestion("cancelar") }] : []),
      ...(porLiberar && !pedido.calificacion ? [{ icono: "estrella", texto: "Calificar", onClick: () => setCalificando(true) }] : []),
    ];

    return (
      <>
        <Pantalla
          mapa={
            <Mapa
              alto={terminado?.fotoId ? 220 : 380}
              variante={estado === "confirmado" || confirmado || terminado ? "destino" : "ruta"}
              progreso={progreso}
              iniciales={iniciales(elegida.prestador.nombre)}
            >
              <BotonFlotante icono="atras" etiqueta="Volver al inicio" href="/" />
              {enVivo ? (
                <PildoraFlotante>
                  <span className="latido h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
                  En vivo
                </PildoraFlotante>
              ) : (
                trabajo?.turno &&
                activo && <PildoraFlotante>{textoDeTurno(trabajo.turno)}</PildoraFlotante>
              )}
            </Mapa>
          }
          pie={
            muestra && !principal ? undefined : (
              <>
                {!muestra && elegida.sinLeer > 0 && (
                  <p className="mb-2 text-center">
                    <Estado tono="bien">Mensaje nuevo de {pila}</Estado>
                  </p>
                )}
                {preparando && (
                  <p className="mb-2 text-center" role="status">
                    <Estado>Estamos preparando tu pago. Puede tardar un minuto.</Estado>
                  </p>
                )}
                {principal ? (
                  <BotonPrimario onClick={principal.accion} cargando={trabajando}>
                    {principal.texto}
                  </BotonPrimario>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChat(elegida)}
                    className="flex h-[52px] w-full items-center gap-2.5 rounded-full bg-subtle pl-[18px] pr-1.5 text-left text-base text-ink-500 active:bg-line"
                  >
                    <span className="min-w-0 flex-1 truncate">Mandale un mensaje a {pila}</span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
                      <Icono nombre="flecha" size={18} />
                    </span>
                  </button>
                )}
              </>
            )
          }
        >
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{titulo}</h1>
            {trabajo?.turno && !confirmado && <span className="cifra shrink-0 text-right text-base font-bold text-ink">{textoDeTurno(trabajo.turno)}</span>}
          </div>

          {!muestra && (
            <div className="mt-4">
              <BarraDeEstados estado={estado} />
            </div>
          )}

          <div className="mt-5 flex items-center gap-3.5">
            <Avatar nombre={elegida.prestador.nombre} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold text-ink">{elegida.prestador.nombre}</p>
              <p className={`truncate text-sm font-semibold ${verificado && !muestra ? "text-success" : "text-ink-500"}`}>
                {muestra ? "De muestra" : verificado ? "Verificado" : "Sin verificar"} · {rubro.nombre}
              </p>
            </div>
            <span className="cifra flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-subtle px-3 text-base font-bold text-ink">
              {pago && pago.estado !== "pendiente" && <Icono nombre="escudo" size={14} />}
              {pesos(elegida.precio)}
            </span>
          </div>

          {!muestra && (
            <div className="mt-5 grid grid-cols-4 gap-2">
              {acciones.map((a) => (
                <BotonRedondo key={a.texto} icono={a.icono} texto={a.texto} onClick={a.onClick} aviso={"aviso" in a ? a.aviso : false} />
              ))}
            </div>
          )}

          {terminado?.fotoId && (
            <figure className="mt-5">
              <img src={`/api/fotos?id=${terminado.fotoId}`} alt={`Cómo quedó el trabajo, según ${pila}`} className="max-h-64 w-full rounded-[22px] object-cover" />
              <figcaption className="mt-2 text-[13px] text-ink-500">La foto del después.</figcaption>
            </figure>
          )}

          <div className="mt-4">
            {muestra && <p className="text-[15px] text-ink-500">Era de muestra. Con un prestador real, acá ves el trabajo en vivo.</p>}
            {datos.direccion && activo && (
              <FilaDeDato icono="candado">
                <b className="font-semibold">{datos.direccion.calle}</b>
                <span className="text-ink-500"> · solo la ve {pila}</span>
              </FilaDeDato>
            )}
            {!muestra && (
              <FilaDeDato icono="escudo">
                {pago ? (
                  <Estado tono={pago.estado === "en_disputa" || pago.estado === "vencido" ? "mal" : pago.estado === "pendiente" ? "neutro" : "bien"}>
                    {TEXTO_DE_PAGO[pago.estado]} · {pago.moneda === "USDC" ? `${pago.monto} USDC` : pesos(Number(pago.monto))}
                  </Estado>
                ) : puedePagar ? (
                  <>
                    <b className="font-semibold">{protegido ? "Pago protegido" : "Pago por la app"}</b>
                    <span className="text-ink-500"> · {protegido ? "queda retenido hasta que confirmes" : "pagás al confirmar que está hecho"}</span>
                  </>
                ) : (
                  <>
                    <b className="font-semibold">Sin pago por la app</b>
                    <span className="text-ink-500"> · arreglen por el chat</span>
                  </>
                )}
              </FilaDeDato>
            )}
            {porLiberar && <p className="mt-2 text-[15px] text-ink-500">Se abre Cosmos Pay: aprobá y liberá con tu billetera.</p>}
            {porPagar && (
              <p className="mt-2 text-[15px] text-ink-500">
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
              <p key={r.creado} className="mt-2">
                {r.estado === "abierto" ? <Estado tono="mal">Reclamo en revisión: {r.motivo.toLowerCase()}</Estado> : <Estado>Reclamo resuelto: {r.resolucion}</Estado>}
              </p>
            ))}
            {pedido.calificacion && (
              <p className="mt-2 flex items-center gap-2">
                <Estrellas valor={pedido.calificacion.estrellas} size={18} />
                <span className="text-[15px] text-ink-500">Gracias por calificar.</span>
              </p>
            )}
          </div>
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

  // Elegí un presupuesto, como "Elegí un viaje": el mapa con un pin de precio por prestador y, en la hoja, todos los
  // presupuestos a la vez para comparar. El marcado lleva un borde; debajo, su mensaje, su perfil y el chat.
  const reales = ofertas.filter((o) => !o.prestador.ejemplo).length;
  const pagoDeLaMarcada = marcada ? explicacionDePago(marcada, datos.pagos && marcada.prestador.cobraPorLaApp && !marcada.prestador.ejemplo) : null;
  const pieDeAcciones = (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Pildora icono={copiado ? "check" : "enlace"} onClick={copiarEnlace}>
        {copiado ? "Enlace copiado" : "Copiar enlace"}
      </Pildora>
      <Pildora icono="cerrar" borde onClick={() => setGestion("cancelar")}>
        Cancelar el pedido
      </Pildora>
    </div>
  );

  return (
    <>
      <Pantalla
        mapa={
          <Mapa alto={290} variante="inicio" etiqueta={pedido.zona} marcas={marcasDelMapa(marcada)}>
            {sobreElMapa()}
          </Mapa>
        }
        bordePie={Boolean(marcada)}
        pie={
          marcada && pagoDeLaMarcada ? (
            <>
              <button type="button" onClick={() => setInfoDePago(true)} className="-mt-1 mb-2 flex h-12 w-full items-center gap-3 text-left text-base font-semibold text-ink">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${pagoDeLaMarcada.titulo === "Pago a coordinar" ? "bg-subtle text-ink" : "bg-success-50 text-success"}`} aria-hidden="true">
                  <Icono nombre="escudo" size={20} />
                </span>
                <span className="flex-1">{pagoDeLaMarcada.titulo}</span>
                <Icono nombre="chevron" size={20} className="text-ink-500" />
              </button>
              <BotonPrimario onClick={() => setPorConfirmar(marcada)}>
                Elegir a {pilaDe(marcada.prestador.nombre)} · <span className="cifra">{pesos(marcada.precio)}</span>
              </BotonPrimario>
            </>
          ) : undefined
        }
      >
        {ofertas.length === 0 ? (
          <>
            <h1 className="text-center text-[21px] font-bold tracking-[-0.01em] text-ink">Buscando presupuestos</h1>
            <p className="mt-0.5 flex items-center justify-center gap-2 text-sm text-ink-500">
              <span className="latido h-2 w-2 rounded-full bg-acento" aria-hidden="true" />
              Avisamos a los de {pedido.zona}
            </p>
            {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
            <p className="mt-5 text-[15px] text-ink-500">Los presupuestos aparecen acá solos. Te pueden llegar hasta {maximo}.</p>
            {pedido.precioMin !== null && pedido.precioMax !== null && (
              <p className="mt-3 text-[15px] text-ink-500">
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
          </>
        ) : (
          <>
            <h1 className="text-center text-[21px] font-bold tracking-[-0.01em] text-ink">Elegí un presupuesto</h1>
            <p className="mt-0.5 text-center text-sm text-ink-500">
              Llegaron {reales > 0 ? reales : ofertas.length}
              {reales > 0 && reales < maximo ? ` de ${maximo}` : ""} · tocá uno para compararlo
            </p>
            {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
            <ul className="-mx-5 mt-2.5 flex flex-col gap-1 border-t border-line px-3 pt-2">
              {ofertas.map((oferta) => {
                const activa = oferta.id === marcada?.id;
                const etiqueta = etiquetaDe(oferta, ofertas);
                const verificado = oferta.prestador.nivel >= 2;
                return (
                  <li key={oferta.id} className={`entrar rounded-2xl border-2 ${activa ? "border-ink" : "border-transparent"}`}>
                    <button type="button" aria-pressed={activa} onClick={() => setSeleccionada(oferta.id)} className="flex w-full items-center gap-3.5 p-3 text-left">
                      <Avatar nombre={oferta.prestador.nombre} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate text-base font-bold text-ink">{oferta.prestador.nombre}</span>
                        <span className="text-sm leading-snug text-ink-500">
                          {cuandoPuede(oferta)} ·{" "}
                          {oferta.prestador.ejemplo ? "de muestra" : <span className={verificado ? "font-semibold text-success" : ""}>{verificado ? "Verificado" : "Sin verificar"}</span>}
                        </span>
                        {(etiqueta || oferta.prestador.reputacion.promedio !== null) && (
                          <span className="flex items-center gap-2">
                            {etiqueta && (
                              <span className={`rounded-md px-2 py-0.5 text-[13px] font-bold ${etiqueta.bien ? "bg-success-50 text-success" : "bg-subtle text-ink"}`}>{etiqueta.texto}</span>
                            )}
                            {oferta.prestador.reputacion.promedio !== null && (
                              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                                <Icono nombre="estrella" size={13} />
                                {oferta.prestador.reputacion.promedio.toFixed(1).replace(".", ",")}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="cifra shrink-0 text-xl font-bold tracking-[-0.02em] text-ink">{pesos(oferta.precio)}</span>
                    </button>
                    {activa && (
                      <div className="px-3 pb-3">
                        {oferta.mensaje && <p className="line-clamp-2 text-[15px] leading-snug text-ink-500">“{oferta.mensaje}”</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Pildora icono="usuario" href={`/p/${oferta.prestador.id}`}>
                            Ver perfil{oferta.prestador.fotos.length > 0 ? " y trabajos" : ""}
                          </Pildora>
                          {!oferta.prestador.ejemplo && (
                            <Pildora icono="mensaje" onClick={() => setChat(oferta)}>
                              Mensaje
                              {oferta.sinLeer > 0 && <span className="h-2 w-2 rounded-full bg-success" aria-label="nuevo" />}
                            </Pildora>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-5">
              <BotonEscuchar texto={frasePresupuestos(ofertas)} />
            </div>
          </>
        )}

        {pedido.diagnostico && <Diagnostico diagnostico={pedido.diagnostico} />}
        {pieDeAcciones}
      </Pantalla>
      {infoDePago && pagoDeLaMarcada && (
        <HojaDeAbajo titulo={pagoDeLaMarcada.titulo} alCerrar={() => setInfoDePago(false)}>
          <p className="text-base leading-snug text-ink">{pagoDeLaMarcada.texto}</p>
          <p className="mt-3 text-[15px] text-ink-500">Nadie ve el teléfono de nadie: todo se habla por el chat de la app.</p>
          <Link href="/terminos" className="mt-2 flex min-h-12 items-center text-[15px] font-semibold text-brand">
            Ver los términos
          </Link>
        </HojaDeAbajo>
      )}
      {pantallaDeChat}
    </>
  );
}

// Una fila de dato con ícono y línea arriba (dirección privada, pago).
function FilaDeDato({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-t border-line py-2 text-[15px] text-ink">
      <Icono nombre={icono} size={20} className="shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
