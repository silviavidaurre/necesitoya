import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { NavVecino } from "@/components/BarraFlotante";
import { ChipBarrio } from "@/components/Barrio";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { CajaRelato } from "@/components/CajaRelato";
import { Diagnostico } from "@/components/Diagnostico";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { ChipConOpciones } from "@/components/Hoja";
import { useCerrarConAtras } from "@/components/useAtras";
import { Mapa } from "@/components/Mapa";
import { iconoDe, useMisPedidos, type MiPedido } from "@/components/useMisPedidos";
import { BotonPrimario, Cabecera, Campo, ErrorDePantalla, Falta, Icono, Pantalla, PildoraFlotante, Seccion, Titulo, claseCampo } from "@/components/ui";
import { RUBROS, pesos, rubroPorId, type RubroId } from "@/lib/catalogo";
import {
  guardarBorrador,
  guardarMiPedido,
  guardarMisDatos,
  leerBorrador,
  leerCuenta,
  leerMisDatos,
  leerMisPedidos,
  leerPrestadorId,
  pedir,
  type CuentaGuardada,
} from "@/lib/cliente";
import { frasePedidoPorRevisar } from "@/lib/frases";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { prepararParlante } from "@/lib/lectura";
import { Link } from "@/lib/navegacion";
import type { Diagnostico as DatosDeDiagnostico, PedidoBorrador, Urgencia } from "@/lib/tipos";

interface ResultadoPedido {
  pedido: PedidoBorrador;
  fuente: "ia" | "basico";
  aviso?: string;
}

// Lo que viaja en el historial del navegador: en qué paso está y, si viene de "Pedir de nuevo" o de un oficio
// del inicio, el relato y el oficio para precargar.
interface EstadoDelPaso {
  paso?: "contar" | "revisar";
  relato?: string;
  rubro?: RubroId;
}

const URGENCIAS: { id: Urgencia; texto: string; icono: string }[] = [
  { id: "hoy", texto: "Para hoy", icono: "reloj" },
  { id: "semana", texto: "Esta semana", icono: "calendario" },
  { id: "flexible", texto: "Sin apuro", icono: "calendario" },
];
const OFICIOS = RUBROS.map((r) => ({ id: r.id as RubroId, texto: r.nombre, icono: r.id }));
// En Contar se puede volver a dejar el oficio en manos de la IA.
const OFICIOS_O_LA_APP: { id: RubroId | "app"; texto: string; icono: string; detalle?: string }[] = [
  { id: "app", texto: "Que lo decida la app", icono: "ayuda", detalle: "Según lo que cuentes" },
  ...OFICIOS,
];

// En la app de Android, el botón atrás del celular vuelve un paso (si no, cerraría la app: todos los pasos son "/").
function AtrasVuelveUnPaso({ alVolver }: { alVolver: () => void }) {
  useCerrarConAtras(alVolver);
  return null;
}

// Accesos por oficio en el inicio: tocar uno abre Contar con ese oficio elegido.
const OFICIOS_DEL_INICIO: RubroId[] = ["plomeria", "electricidad", "gas", "cerrajeria", "albanileria", "pintura", "carpinteria", "herreria"];

// Pedir en tres pasos, como en una app de viajes:
// 1. Inicio: el mapa del barrio y un solo campo, "Contá qué pasó". Abajo, los últimos pedidos y los oficios.
// 2. Contar: barrio y urgencia en chips, el texto, el micrófono grande y la foto.
// 3. Tu pedido: lo que armó la IA (título, oficio, lo que suele costar y el diagnóstico) para revisar y publicar.
// Cada paso va en el historial del navegador: el botón atrás vuelve sin perder nada. El barrio y el nombre quedan
// recordados en el celular. No se pide teléfono: el prestador le escribe por el chat de la app.
export default function Pedir() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const tipoDeNavegacion = useNavigationType();
  const [parametros] = useSearchParams();
  const estadoDelPaso = (ubicacion.state as EstadoDelPaso | null) ?? {};
  // Desde un perfil público se llega con ?texto=…: va directo a Contar.
  const paso = estadoDelPaso.paso ?? (parametros.has("texto") ? "contar" : "inicio");

  // Lo recordado en este celular. Se lee una sola vez al abrir.
  const [recordado] = useState(leerMisDatos);
  const [borrador] = useState(leerBorrador);
  const [esPrestador, setEsPrestador] = useState(false);
  // Para publicar hace falta una cuenta. Se pide recién al final, cuando el pedido ya está armado.
  const [cuenta, setCuenta] = useState<CuentaGuardada | null>(null);
  useEffect(() => {
    setEsPrestador(Boolean(leerPrestadorId()));
    setCuenta(leerCuenta());
  }, []);
  // Los 3 más nuevos; el resto está en Mis pedidos.
  const { pedidos: misPedidos } = useMisPedidos(paso === "inicio" ? 3 : 0);
  const [hayMas] = useState(() => leerMisPedidos().length > 3);

  // Contar
  const [zona, setZona] = useState(recordado.zona);
  const [relato, setRelato] = useState(estadoDelPaso.relato ?? parametros.get("texto") ?? borrador?.relato ?? "");
  // Oficio y urgencia que el vecino eligió antes de que la IA arme el pedido (si no, los decide la IA).
  const [rubroElegido, setRubroElegido] = useState<RubroId | null>(estadoDelPaso.rubro ?? null);
  const [urgenciaElegida, setUrgenciaElegida] = useState<Urgencia | null>(null);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [vozOcupada, setVozOcupada] = useState(false);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState("");
  const entradaFoto = useRef<HTMLInputElement>(null);
  const terminarDictado = useRef<(() => Promise<string>) | null>(null);
  const usoLaVoz = useRef(borrador?.porVoz ?? false);
  const guardarTerminar = useCallback((terminar: () => Promise<string>) => {
    terminarDictado.current = terminar;
  }, []);
  const anotarVoz = useCallback(() => {
    usoLaVoz.current = true;
  }, []);

  // "Pedir de nuevo", los oficios del inicio y los perfiles públicos (?texto=) llegan con el relato y el oficio:
  // se precargan una sola vez y se sacan de la entrada del historial. Así, volver o avanzar a Contar no pisa lo
  // que la persona escribió después (y no se puede publicar dos veces lo mismo volviendo atrás).
  useEffect(() => {
    const texto = parametros.get("texto");
    if (!estadoDelPaso.relato && !estadoDelPaso.rubro && texto === null) return;
    if (estadoDelPaso.relato) setRelato(estadoDelPaso.relato);
    else if (texto !== null) setRelato(texto);
    if (estadoDelPaso.rubro) setRubroElegido(estadoDelPaso.rubro);
    navegar(ubicacion.pathname, { replace: true, state: { paso: estadoDelPaso.paso ?? "contar" } });
    // Solo cuando cambia la entrada del historial.
  }, [ubicacion.key]);

  // Lo contado se guarda mientras dure la visita: si se recarga la página o se sale por error, sigue ahí.
  useEffect(() => {
    guardarBorrador(relato.trim() ? { relato, porVoz: usoLaVoz.current } : null);
  }, [relato]);

  // Revisar
  const [fuente, setFuente] = useState<"ia" | "basico">("ia");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [rubro, setRubro] = useState<RubroId>("otros");
  const [urgencia, setUrgencia] = useState<Urgencia>("semana");
  const [rango, setRango] = useState<{ min: number; max: number } | null>(null);
  const [diagnostico, setDiagnostico] = useState<DatosDeDiagnostico | null>(null);
  // Corregir el título y el detalle que armó la IA.
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [leerSolo, setLeerSolo] = useState(false);

  const [nombre, setNombre] = useState(recordado.nombre);
  const tieneNombre = recordado.nombre.trim().length >= 2;
  const [cambiandoContacto, setCambiandoContacto] = useState(!tieneNombre);
  const [faltas, setFaltas] = useState<{ nombre?: string }>({});
  const [publicando, setPublicando] = useState(false);
  // Un identificador por pedido: si la respuesta se pierde y se reintenta, el servidor no lo crea dos veces.
  const idCliente = useRef(crypto.randomUUID());

  // Si la página se recargó en "revisar" ya no hay pedido armado: se muestra Contar, con lo contado guardado.
  const enRevision = paso === "revisar" && titulo !== "";
  const enContar = paso === "contar" || (paso === "revisar" && titulo === "");

  // Volver a Contar con el botón atrás después de publicar deja la pantalla vacía: ahí se va al inicio.
  useEffect(() => {
    if (paso === "contar" && tipoDeNavegacion === "POP" && !relato.trim()) {
      navegar(ubicacion.pathname, { replace: true, state: null });
    }
    // Solo al llegar a esta entrada del historial.
  }, [ubicacion.key]);

  function abrirContar(precarga: Omit<EstadoDelPaso, "paso"> = {}) {
    navegar(ubicacion.pathname, { state: { paso: "contar", ...precarga } });
  }

  // Volver un paso. Si se llegó directo (recarga o enlace), no hay a dónde volver en el historial: se va al inicio.
  function volver() {
    const indice = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (indice > 0) navegar(-1);
    else navegar(ubicacion.pathname, { replace: true, state: null });
  }

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setCargandoFoto(true);
    try {
      setFoto(await achicarFoto(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos usar esa foto. Probá con otra.");
    } finally {
      setCargandoFoto(false);
      if (entradaFoto.current) entradaFoto.current.value = "";
    }
  }

  async function armar() {
    // Dentro del toque, para que después la app pueda leer el resumen sola (los celulares lo exigen).
    if (usoLaVoz.current) prepararParlante();
    setError("");
    setArmando(true);
    try {
      const texto = (terminarDictado.current ? await terminarDictado.current() : relato).trim();
      const resultado = await pedir<ResultadoPedido>("/api/ia/pedido", {
        method: "POST",
        body: JSON.stringify({ texto, foto: foto ? { tipo: foto.tipo, base64: foto.base64 } : undefined }),
        espera: 45_000,
      });
      setTitulo(resultado.pedido.titulo);
      setDescripcion(resultado.pedido.descripcion);
      setRubro(rubroElegido ?? resultado.pedido.rubro);
      setUrgencia(urgenciaElegida ?? resultado.pedido.urgencia);
      setRango(
        resultado.pedido.precioMin !== null && resultado.pedido.precioMax !== null
          ? { min: resultado.pedido.precioMin, max: resultado.pedido.precioMax }
          : null,
      );
      setDiagnostico(resultado.pedido.diagnostico ?? null);
      setFuente(resultado.fuente);
      setCorrigiendo(false);
      setLeerSolo(usoLaVoz.current);
      navegar(ubicacion.pathname, { state: { paso: "revisar" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos armar tu pedido. Probá de nuevo.");
    } finally {
      setArmando(false);
    }
  }

  async function publicar() {
    const nuevas: typeof faltas = {};
    if (nombre.trim().length < 2) nuevas.nombre = "Escribí tu nombre.";
    setFaltas(nuevas);
    if (Object.keys(nuevas).length > 0) {
      setCambiandoContacto(true);
      return;
    }

    setLeerSolo(false);
    setError("");
    setPublicando(true);
    try {
      const datos = await pedir<{ id: string; clave: string }>("/api/pedidos", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          descripcion,
          rubro,
          urgencia,
          zona,
          precioMin: rango?.min ?? null,
          precioMax: rango?.max ?? null,
          relato: relato.trim(),
          clienteNombre: nombre,
          foto: foto ? { tipo: foto.tipo, base64: foto.base64 } : undefined,
          idCliente: idCliente.current,
          diagnostico,
          cuenta: cuenta?.clave ?? leerCuenta()?.clave,
        }),
        espera: 45_000,
      });
      guardarMisDatos({ zona, nombre: nombre.trim() });
      guardarMiPedido({ id: datos.id, clave: datos.clave, titulo, creado: new Date().toISOString() });
      guardarBorrador(null);
      navegar(`/pedido/${datos.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos publicar tu pedido. Probá de nuevo.");
      setPublicando(false);
    }
  }

  if (armando) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center" role="status">
        <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink">Armando tu pedido</h1>
        <p className="text-[17px] text-ink-500">Tarda unos segundos.</p>
      </main>
    );
  }

  // --- 3. Tu pedido -----------------------------------------------------------------------------
  if (enRevision) {
    const rubroActual = rubroPorId(rubro);
    const urgenciaActual = URGENCIAS.find((u) => u.id === urgencia);
    const falta = !zona.trim() ? "Falta elegir tu barrio" : titulo.trim().length < 4 ? "Falta decir qué necesitás" : !cuenta ? "Falta entrar con tu cuenta" : "";
    const resumenEnVoz = frasePedidoPorRevisar({
      titulo,
      rubro: rubroActual.nombre,
      esOtroRubro: rubro === "otros",
      zona,
      urgencia,
      precioMin: rango?.min ?? null,
      precioMax: rango?.max ?? null,
    });

    return (
      <Pantalla
        key="revisar"
        pie={
          <>
            {falta && <Falta>{falta}</Falta>}
            <BotonPrimario onClick={publicar} disabled={Boolean(falta)} cargando={publicando}>
              Pedir presupuestos
            </BotonPrimario>
            <p className="mt-2 text-center text-sm text-ink-500">Gratis. No te compromete a contratar.</p>
          </>
        }
      >
        <AtrasVuelveUnPaso alVolver={volver} />
        <Cabecera alVolver={volver} titulo="Tu pedido" />
        {fuente === "basico" && <p className="mt-1 text-[15px] text-ink-500">No pudimos ordenarlo solos. Revisá el texto y el oficio.</p>}

        {corrigiendo ? (
          <>
            <Campo etiqueta="Qué necesitás">
              <input className={claseCampo} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} />
            </Campo>
            <Campo etiqueta="Detalle para el prestador">
              <textarea className={`${claseCampo} min-h-28 resize-none`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
            </Campo>
            <button type="button" onClick={() => setCorrigiendo(false)} className="mt-2 flex min-h-12 items-center text-base font-semibold text-brand">
              Listo
            </button>
          </>
        ) : (
          <div className="mt-3">
            <h2 className="text-2xl font-bold leading-[1.15] tracking-[-0.01em] text-ink">{titulo}</h2>
            {descripcion && descripcion !== titulo && <p className="mt-1.5 text-[15px] leading-snug text-ink-500">{descripcion}</p>}
            <button type="button" onClick={() => setCorrigiendo(true)} className="flex min-h-11 items-center text-[15px] font-semibold text-brand">
              Corregir el texto
            </button>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-start gap-2">
          <ChipConOpciones titulo="¿Qué oficio es?" opciones={OFICIOS} valor={rubro} alCambiar={setRubro} etiqueta={`Oficio: ${rubroActual.nombre}. Cambiar`} />
          <ChipBarrio zona={zona} alCambiar={setZona} />
          <ChipConOpciones titulo="¿Para cuándo?" opciones={URGENCIAS} valor={urgencia} alCambiar={setUrgencia} icono="reloj" etiqueta={`Urgencia: ${urgenciaActual?.texto}. Cambiar`} />
          <BotonEscuchar texto={resumenEnVoz} automatico={leerSolo} />
        </div>

        {rango && (
          <div className="mt-6">
            <p className="text-[15px] text-ink-500">Suele costar</p>
            <p className="cifra mt-0.5 text-[30px] font-bold leading-tight tracking-[-0.03em] text-ink">
              {pesos(rango.min)} <span className="text-ink-500">a</span> {pesos(rango.max)}
            </p>
            <p className="mt-1 text-sm text-ink-500">Mano de obra aproximada. El precio lo pone cada prestador.</p>
          </div>
        )}

        {diagnostico && <Diagnostico diagnostico={diagnostico} />}

        <Seccion>¿Cómo te llamás?</Seccion>
        {cambiandoContacto ? (
          <Campo etiqueta="Tu nombre" error={faltas.nombre} ayuda="Te escriben por el chat de la app. Nadie ve tu teléfono.">
            <input className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" maxLength={60} />
          </Campo>
        ) : (
          <div className="mt-1 flex min-h-16 items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{nombre}</p>
              <p className="text-[15px] text-ink-500">Te escriben por el chat de la app. Nadie ve tu teléfono.</p>
            </div>
            <button type="button" onClick={() => setCambiandoContacto(true)} className="flex min-h-12 items-center text-base font-semibold text-brand">
              Cambiar
            </button>
          </div>
        )}

        {!cuenta && (
          <EntrarACuenta
            abiertoAlInicio
            titulo="Entrá para pedir"
            motivo="Con tu cuenta seguís el pedido desde cualquier celular."
            alEntrar={(nueva) => {
              setCuenta(nueva);
              if (nombre.trim().length < 2) setNombre(nueva.nombre);
            }}
          />
        )}

        {foto && <img src={foto.vistaPrevia} alt="Foto que mandaste" className="mt-6 max-h-52 w-full rounded-[22px] object-cover" />}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // --- 2. Contar --------------------------------------------------------------------------------
  if (enContar) {
    const hayAlgo = relato.trim().length >= 5 || foto !== null || vozOcupada;
    const falta = !zona.trim() ? "Falta elegir tu barrio" : !hayAlgo ? "Contá qué necesitás o agregá una foto" : "";
    const urgenciaActual = URGENCIAS.find((u) => u.id === urgenciaElegida);
    return (
      <Pantalla
        key="contar"
        pie={
          <>
            {error ? <ErrorDePantalla>{error}</ErrorDePantalla> : falta && (relato || foto) ? <Falta>{falta}</Falta> : null}
            <BotonPrimario onClick={armar} disabled={Boolean(falta)}>
              Continuar
              <Icono nombre="flecha" size={22} />
            </BotonPrimario>
          </>
        }
      >
        <AtrasVuelveUnPaso alVolver={volver} />
        <Cabecera alVolver={volver} titulo="Contanos qué pasa" />

        <div className="mt-2 flex flex-wrap gap-2">
          <ChipBarrio zona={zona} alCambiar={setZona} />
          <ChipConOpciones
            titulo="¿Para cuándo?"
            opciones={URGENCIAS}
            valor={urgenciaElegida}
            alCambiar={setUrgenciaElegida}
            icono="reloj"
            texto={urgenciaActual?.texto ?? "¿Cuándo?"}
            etiqueta={urgenciaActual ? `Urgencia: ${urgenciaActual.texto}. Cambiar` : "Elegir para cuándo lo necesitás"}
          />
          {rubroElegido && (
            <ChipConOpciones
              titulo="¿Qué oficio es?"
              opciones={OFICIOS_O_LA_APP}
              valor={rubroElegido}
              alCambiar={(valor) => setRubroElegido(valor === "app" ? null : valor)}
              etiqueta={`Oficio: ${rubroPorId(rubroElegido).nombre}. Cambiar`}
            />
          )}
        </div>

        <div className="mt-5">
          <CajaRelato
            textoPrimero
            etiqueta="Qué pasó"
            valor={relato}
            alCambiar={setRelato}
            invitacion="Tocá y contalo"
            ejemplo="Ej: se me rompió el termotanque, pierde agua por abajo."
            alDetener={guardarTerminar}
            alDictar={anotarVoz}
            alOcuparse={setVozOcupada}
          />
        </div>

        {/* Sin `capture`: así el celular deja elegir entre sacar la foto o usar una de la galería. */}
        <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={(e) => elegirFoto(e.target.files?.[0])} />
        <section aria-label="Fotos" className="mt-7">
          <h2 className="text-lg font-bold text-ink">Fotos</h2>
          <div className="mt-2.5 flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => entradaFoto.current?.click()}
              disabled={cargandoFoto}
              className="flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-subtle text-[13px] font-semibold text-ink active:bg-line disabled:opacity-60"
            >
              <Icono nombre="camara" size={26} />
              {cargandoFoto ? "Preparando" : foto ? "Cambiar" : "Agregar"}
            </button>
            {foto ? (
              <div className="relative h-[88px] w-[88px] shrink-0">
                <img src={foto.vistaPrevia} alt="Foto del problema" className="h-full w-full rounded-2xl object-cover" />
                <button
                  type="button"
                  onClick={() => setFoto(null)}
                  aria-label="Quitar la foto"
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white shadow-[var(--sombra-flota)]"
                >
                  <Icono nombre="cerrar" size={16} />
                </button>
              </div>
            ) : (
              <span className="text-[15px] leading-snug text-ink-500">Una foto ayuda a que te presupuesten mejor. Podés sacarla o elegirla de la galería.</span>
            )}
          </div>
        </section>
      </Pantalla>
    );
  }

  // --- 1. Inicio --------------------------------------------------------------------------------
  return (
    <>
    <Pantalla
      key="inicio"
      conNav
      mapa={
        <Mapa alto={300} variante="inicio" etiqueta={zona || "San Salvador de Jujuy"}>
          <ChipBarrio
            zona={zona}
            alCambiar={(nueva) => {
              setZona(nueva);
              guardarMisDatos({ zona: nueva });
            }}
            variante="flotante"
            sinElegir="Tu barrio"
          />
          <PildoraFlotante href="/prestador">{esPrestador ? "Ver pedidos" : "Tengo un oficio"}</PildoraFlotante>
        </Mapa>
      }
    >
      <Titulo>¿Qué se rompió?</Titulo>

      <button
        type="button"
        onClick={() => abrirContar()}
        className="mt-4 flex h-[60px] w-full items-center gap-3 rounded-2xl bg-subtle pl-4 pr-2 text-left text-[17px] active:bg-line"
      >
        <Icono nombre="buscar" size={22} className="shrink-0 text-ink-500" />
        <span className={`min-w-0 flex-1 truncate ${relato ? "text-ink" : "text-ink-500"}`}>{relato || "Contá qué pasó"}</span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
          <Icono nombre="mic" size={20} />
        </span>
      </button>

      {misPedidos.length > 0 && (
        <section aria-label="Tus pedidos" className="mt-5 rounded-[18px] border border-line">
          {misPedidos.map((pedido) => (
            <FilaDePedido key={pedido.id} pedido={pedido} />
          ))}
          {hayMas && (
            <Link href="/mis-pedidos" className="flex min-h-14 w-full items-center justify-between border-t border-line px-4 text-[15px] font-semibold text-ink">
              Ver todos tus pedidos
              <Icono nombre="chevron" size={20} className="text-ink-500" />
            </Link>
          )}
        </section>
      )}

      <Seccion>Oficios</Seccion>
      <div className="sin-barra -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {OFICIOS_DEL_INICIO.map((id) => {
          const oficio = rubroPorId(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => abrirContar({ rubro: id, ...(relato.trim() ? {} : { relato: `Necesito un trabajo de ${oficio.nombre.toLowerCase()}: ` }) })}
              className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center text-[13px] font-semibold leading-tight text-ink"
            >
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-subtle active:bg-line" aria-hidden="true">
                <Icono nombre={id} size={28} />
              </span>
              {oficio.nombre}
            </button>
          );
        })}
      </div>

      {!cuenta && (
        <p className="mt-6 text-center text-[15px] text-ink-500">
          ¿Ya pediste con tu cuenta?{" "}
          <Link href="/cuenta" className="font-semibold text-brand">
            Entrá desde Cuenta
          </Link>
        </p>
      )}
    </Pantalla>
    <NavVecino />
    </>
  );
}

// Una fila de "Tus pedidos": el ícono del oficio, el título y cómo va.
function FilaDePedido({ pedido }: { pedido: MiPedido }) {
  const color = pedido.tono === "bien" ? "font-semibold text-success" : pedido.tono === "acento" ? "font-semibold text-ink" : "text-ink-500";
  return (
    <Link href={`/pedido/${pedido.id}`} className="flex min-h-[72px] items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink" aria-hidden="true">
        <Icono nombre={iconoDe(pedido)} size={22} />
        {pedido.sinLeer > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-success ring-2 ring-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink">{pedido.titulo}</span>
        <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${color}`}>
          {pedido.tono !== "neutro" && <span className={`h-2 w-2 shrink-0 rounded-full ${pedido.tono === "bien" ? "bg-success" : "bg-acento"}`} aria-hidden="true" />}
          <span className="truncate">{pedido.texto}</span>
        </span>
        {pedido.sinLeer > 0 && <span className="sr-only">Tenés un mensaje nuevo.</span>}
      </span>
      <Icono nombre="chevron" size={20} className="shrink-0 text-ink-500" />
    </Link>
  );
}
