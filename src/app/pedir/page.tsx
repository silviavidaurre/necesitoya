import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { CajaRelato } from "@/components/CajaRelato";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { Logo } from "@/components/Logo";
import {
  BotonPrimario,
  BotonSecundario,
  Cabecera,
  Campo,
  Chip,
  ErrorDePantalla,
  Falta,
  Fila,
  Icono,
  IconoCirculo,
  Pantalla,
  Seccion,
  Segmentado,
  Titulo,
  claseCampo,
} from "@/components/ui";
import { RUBROS, ZONAS, pesos, rubroPorId, type RubroId } from "@/lib/catalogo";
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
  type PedidoGuardado,
} from "@/lib/cliente";
import { frasePedidoPorRevisar } from "@/lib/frases";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { prepararParlante } from "@/lib/lectura";
import { Link } from "@/lib/navegacion";
import type { PedidoBorrador, Urgencia } from "@/lib/tipos";

interface ResultadoPedido {
  pedido: PedidoBorrador;
  fuente: "ia" | "basico";
  aviso?: string;
}

type Cambio = "texto" | "rubro" | "zona" | "urgencia" | null;

const URGENCIAS: { id: Urgencia; texto: string }[] = [
  { id: "hoy", texto: "Hoy" },
  { id: "semana", texto: "Esta semana" },
  { id: "flexible", texto: "Sin apuro" },
];
const TEXTO_URGENCIA: Record<Urgencia, string> = { hoy: "Para hoy", semana: "Esta semana", flexible: "Sin apuro" };

const ATAJOS = ["Tengo una pérdida de agua", "Necesito un electricista", "Necesito que corten el pasto", "Necesito un flete"];
const OTRO_BARRIO = "__otro__";

// "Llegás y pedís": el inicio ya es el pedido. Se habla (o se escribe, o se saca una foto), la IA lo ordena
// y en una sola pantalla se revisa y se publica. El barrio y el nombre quedan recordados en el celular,
// así la segunda vez son dos toques. No se pide teléfono: el prestador le escribe por el chat de la app.
export default function Pedir() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [parametros] = useSearchParams();

  // Lo recordado en este celular. Se lee una sola vez al abrir.
  const [recordado] = useState(leerMisDatos);
  const [borrador] = useState(leerBorrador);
  const [misPedidos, setMisPedidos] = useState<PedidoGuardado[]>([]);
  const [esPrestador, setEsPrestador] = useState(false);
  useEffect(() => {
    setMisPedidos(leerMisPedidos());
    setEsPrestador(Boolean(leerPrestadorId()));
  }, []);

  // Contar
  const [zona, setZona] = useState(recordado.zona);
  const [eligiendoZona, setEligiendoZona] = useState(!recordado.zona);
  const [zonaLibre, setZonaLibre] = useState(false);
  const [relato, setRelato] = useState(parametros.get("texto") ?? borrador?.relato ?? "");
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
  const [cambio, setCambio] = useState<Cambio>(null);
  const [leerSolo, setLeerSolo] = useState(false);

  const [nombre, setNombre] = useState(recordado.nombre);
  const tieneNombre = recordado.nombre.trim().length >= 2;
  const [cambiandoContacto, setCambiandoContacto] = useState(!tieneNombre);
  const [faltas, setFaltas] = useState<{ nombre?: string }>({});
  const [publicando, setPublicando] = useState(false);
  // Un identificador por pedido: si la respuesta se pierde y se reintenta, el servidor no lo crea dos veces.
  const idCliente = useRef(crypto.randomUUID());

  // El paso va en el historial del navegador: el botón atrás del celular vuelve a "contar" sin perder nada.
  // Si la página se recargó en "revisar" ya no hay pedido armado, así que se vuelve al inicio.
  const enRevision = (ubicacion.state as { paso?: string } | null)?.paso === "revisar" && titulo !== "";

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
      setRubro(resultado.pedido.rubro);
      setUrgencia(resultado.pedido.urgencia);
      setRango(
        resultado.pedido.precioMin !== null && resultado.pedido.precioMax !== null
          ? { min: resultado.pedido.precioMin, max: resultado.pedido.precioMax }
          : null,
      );
      setFuente(resultado.fuente);
      setCambio(resultado.fuente === "basico" ? "rubro" : null);
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
          cuenta: leerCuenta()?.clave,
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

  const selectorDeBarrio = (
    <>
      <select
        className={claseCampo}
        value={zonaLibre ? OTRO_BARRIO : zona}
        onChange={(e) => {
          if (e.target.value === OTRO_BARRIO) {
            setZonaLibre(true);
            setZona("");
          } else {
            setZonaLibre(false);
            setZona(e.target.value);
            if (e.target.value) setEligiendoZona(false);
          }
        }}
      >
        <option value="">Elegí tu barrio</option>
        {ZONAS.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
        <option value={OTRO_BARRIO}>Otro barrio</option>
      </select>
      {zonaLibre && (
        <input className={`${claseCampo} mt-2`} value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Escribí el nombre de tu barrio" maxLength={60} />
      )}
    </>
  );

  if (armando) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center" role="status">
        <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink">Armando tu pedido</h1>
        <p className="text-[17px] text-ink-500">Tarda unos segundos.</p>
      </main>
    );
  }

  if (enRevision) {
    const rubroActual = rubroPorId(rubro);
    const falta = !zona.trim() ? "Falta elegir tu barrio" : titulo.trim().length < 4 ? "Falta decir qué necesitás" : "";
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
            <p className="mt-2 text-center text-[15px] text-ink-500">Gratis. No te compromete a contratar.</p>
          </>
        }
      >
        <Cabecera alVolver={() => navegar(-1)} />
        <Titulo pregunta={fuente === "ia" ? undefined : "No pudimos ordenarlo solos. Completalo vos."}>¿Está bien así?</Titulo>
        <div className="mt-4">
          <BotonEscuchar texto={resumenEnVoz} automatico={leerSolo} />
        </div>

        {cambio === "texto" ? (
          <>
            <Campo etiqueta="Qué necesitás">
              <input className={claseCampo} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} />
            </Campo>
            <Campo etiqueta="Detalle para el prestador">
              <textarea className={`${claseCampo} min-h-28 resize-none`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
            </Campo>
          </>
        ) : (
          <div className="mt-6">
            <p className="text-[22px] font-bold leading-snug tracking-[-0.01em] text-ink">{titulo}</p>
            <p className="mt-2 text-base text-ink-500">{descripcion}</p>
            <button type="button" onClick={() => setCambio("texto")} className="mt-1 flex min-h-12 items-center text-base font-semibold text-brand">
              Corregir el texto
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setCambio(cambio === "rubro" ? null : "rubro")} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#8f96a1] px-4 text-[15px] font-semibold text-ink">
            <Icono nombre={rubroActual.id} size={18} />
            {rubroActual.nombre}
          </button>
          <button type="button" onClick={() => setCambio(cambio === "zona" ? null : "zona")} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#8f96a1] px-4 text-[15px] font-semibold text-ink">
            <Icono nombre="pin" size={18} />
            {zona || "Elegí tu barrio"}
          </button>
          <button type="button" onClick={() => setCambio(cambio === "urgencia" ? null : "urgencia")} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#8f96a1] px-4 text-[15px] font-semibold text-ink">
            <Icono nombre="reloj" size={18} />
            {TEXTO_URGENCIA[urgencia]}
          </button>
        </div>
        {cambio === null && <p className="mt-2 text-[15px] text-ink-500">Tocá cualquiera para cambiarlo.</p>}
        {cambio === "rubro" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {RUBROS.map((opcion) => (
              <Chip
                key={opcion.id}
                activo={rubro === opcion.id}
                onClick={() => {
                  setRubro(opcion.id);
                  setCambio(null);
                }}
              >
                {opcion.nombre}
              </Chip>
            ))}
          </div>
        )}
        {cambio === "zona" && <div className="mt-3">{selectorDeBarrio}</div>}
        {cambio === "urgencia" && (
          <div className="mt-3">
            <Segmentado
              opciones={URGENCIAS}
              valor={urgencia}
              alCambiar={(valor) => {
                setUrgencia(valor);
                setCambio(null);
              }}
            />
          </div>
        )}

        {rango && (
          <div className="mt-7">
            <p className="text-base text-ink-500">Suele costar</p>
            <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.03em] text-ink">
              {pesos(rango.min)} <span className="text-ink-500">a</span> {pesos(rango.max)}
            </p>
            <p className="mt-1 text-[15px] text-ink-500">Es un precio aproximado de la mano de obra. El precio final lo pone cada prestador.</p>
          </div>
        )}

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

        {foto && <img src={foto.vistaPrevia} alt="Foto que mandaste" className="mt-6 max-h-52 w-full rounded-[22px] object-cover" />}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  const hayAlgo = relato.trim().length >= 5 || foto !== null || vozOcupada;
  const falta = !zona.trim() ? "Falta elegir tu barrio" : !hayAlgo ? "Contá qué necesitás o sacá una foto" : "";

  return (
    <Pantalla
      key="contar"
      pie={
        <>
          {error ? <ErrorDePantalla>{error}</ErrorDePantalla> : falta && (relato || foto || zona) ? <Falta>{falta}</Falta> : null}
          <BotonPrimario onClick={armar} disabled={Boolean(falta)}>
            Continuar
          </BotonPrimario>
        </>
      }
    >
      <header className="flex h-[60px] items-center justify-between">
        <Logo />
        <Link href="/prestador" className="flex min-h-12 items-center text-base font-semibold text-brand">
          {esPrestador ? "Ver pedidos" : "Tengo un oficio"}
        </Link>
      </header>

      <div className="mt-3">
        <Titulo>¿Qué necesitás?</Titulo>
      </div>

      <div className="mt-4">
        {eligiendoZona ? (
          <label className="block">
            <span className="text-[15px] font-semibold text-ink">¿En qué barrio es?</span>
            <div className="mt-2">{selectorDeBarrio}</div>
          </label>
        ) : (
          <button type="button" onClick={() => setEligiendoZona(true)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#8f96a1] px-4 text-[15px] text-ink">
            <Icono nombre="pin" size={18} />
            <span className="font-semibold">{zona}</span>
            <span className="font-semibold text-brand">Cambiar</span>
          </button>
        )}
      </div>

      <div className="mt-7">
        <CajaRelato
          valor={relato}
          alCambiar={setRelato}
          invitacion="Tocá y contalo"
          ejemplo="Ej: se me rompió el termotanque, pierde agua por abajo."
          alDetener={guardarTerminar}
          alDictar={anotarVoz}
          alOcuparse={setVozOcupada}
        />
      </div>

      {!relato && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ATAJOS.map((atajo) => (
            <button key={atajo} type="button" onClick={() => setRelato(atajo)} className="inline-flex min-h-11 items-center rounded-full bg-subtle px-4 text-[15px] font-medium text-ink">
              {atajo}
            </button>
          ))}
        </div>
      )}

      {/* Sin `capture`: así el celular deja elegir entre sacar la foto o usar una de la galería. */}
      <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={(e) => elegirFoto(e.target.files?.[0])} />
      <div className="mt-4">
        {foto ? (
          <div className="flex items-center gap-4">
            <img src={foto.vistaPrevia} alt="Foto del problema" className="h-16 w-16 rounded-2xl object-cover" />
            <span className="flex-1 text-base font-semibold text-ink">Foto lista</span>
            <button type="button" onClick={() => setFoto(null)} className="min-h-12 px-2 text-base font-semibold text-ink-500">
              Quitar
            </button>
          </div>
        ) : (
          <BotonSecundario onClick={() => entradaFoto.current?.click()} disabled={cargandoFoto}>
            <Icono nombre="camara" size={20} />
            {cargandoFoto ? "Preparando la foto" : "Sumar una foto"}
          </BotonSecundario>
        )}
      </div>

      {misPedidos.length > 0 && (
        <>
          <Seccion>Tus pedidos</Seccion>
          <div className="mt-1 divide-y divide-line">
            {misPedidos.slice(0, 3).map((pedido) => (
              <Fila key={pedido.id} href={`/pedido/${pedido.id}`} icono={<IconoCirculo nombre="lista" />} titulo={pedido.titulo} detalle="Ver presupuestos" />
            ))}
          </div>
        </>
      )}

      <EntrarACuenta motivo="Para no perder tus pedidos si cambiás de celular." />
    </Pantalla>
  );
}
