import { useCallback, useEffect, useRef, useState } from "react";
import { CajaRelato } from "@/components/CajaRelato";
import { BotonPrimario, Cabecera, Campo, Chip, ErrorDePantalla, Falta, Pantalla, Titulo, claseCampo } from "@/components/ui";
import { RUBROS, ZONAS, type RubroId } from "@/lib/catalogo";
import { useSearchParams } from "react-router-dom";
import { recordarPrestador } from "@/components/usePrestador";
import { guardarPrestadorId, leerCuenta, leerPrestadorId, numeroNacional, pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";
import type { PerfilBorrador, Prestador } from "@/lib/tipos";

type Paso = "contar" | "armando" | "revisar";

interface ResultadoPerfil {
  perfil: PerfilBorrador;
  fuente: "ia" | "basico";
  aviso?: string;
}

// Alta del prestador en dos pantallas: contar qué hace, y revisar el perfil armado.
// El celular es opcional y no se le muestra a nadie: los vecinos le escriben por el chat de la app.
export default function AltaPrestador() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("contar");
  const [relato, setRelato] = useState("");
  const [error, setError] = useState("");
  const [fuente, setFuente] = useState<"ia" | "basico">("ia");
  const terminarDictado = useRef<(() => Promise<string>) | null>(null);
  const guardarTerminar = useCallback((terminar: () => Promise<string>) => {
    terminarDictado.current = terminar;
  }, []);

  const [nombre, setNombre] = useState("");
  const [rubros, setRubros] = useState<RubroId[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [anios, setAnios] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [faltas, setFaltas] = useState<{ nombre?: string; rubros?: string; whatsapp?: string }>({});
  const [guardando, setGuardando] = useState(false);
  // Si vino desde un pedido que quería presupuestar, al terminar vuelve a ese pedido.
  const [parametros] = useSearchParams();
  const pedidoPendiente = parametros.get("pedido");
  const destino = pedidoPendiente ? `/prestador?pedido=${encodeURIComponent(pedidoPendiente)}` : "/prestador";
  // Un identificador por alta: si la respuesta se pierde y se reintenta, no se crean dos perfiles.
  const idCliente = useRef(crypto.randomUUID());

  useEffect(() => {
    if (leerPrestadorId()) router.replace(destino);
  }, [router, destino]);

  async function armarPerfil() {
    setError("");
    setPaso("armando");
    try {
      // Espera lo último que dictó: cuando el audio se pasa a texto en el servidor, llega un momento después de cortar.
      const texto = (terminarDictado.current ? await terminarDictado.current() : relato).trim();
      const resultado = await pedir<ResultadoPerfil>("/api/ia/perfil", { method: "POST", body: JSON.stringify({ texto }), espera: 45_000 });
      setNombre(resultado.perfil.nombre);
      setRubros(resultado.perfil.rubros);
      setZonas(resultado.perfil.zonas);
      setAnios(resultado.perfil.aniosExperiencia > 0 ? String(resultado.perfil.aniosExperiencia) : "");
      setDescripcion(resultado.perfil.descripcion);
      setDisponibilidad(resultado.perfil.disponibilidad);
      setFuente(resultado.fuente);
      setPaso("revisar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos armar tu perfil. Probá de nuevo.");
      setPaso("contar");
    }
  }

  async function guardar() {
    const nuevas: typeof faltas = {};
    if (nombre.trim().length < 2) nuevas.nombre = "Escribí tu nombre y apellido.";
    if (rubros.length === 0) nuevas.rubros = "Elegí al menos un oficio.";
    if (whatsapp.trim() && numeroNacional(whatsapp) === null) nuevas.whatsapp = "Escribilo con la característica, por ejemplo 388 4123456. O dejalo vacío.";
    setFaltas(nuevas);
    if (Object.keys(nuevas).length > 0) return;

    setError("");
    setGuardando(true);
    try {
      const datos = await pedir<{ prestador: Prestador }>("/api/prestadores", {
        method: "POST",
        body: JSON.stringify({
          nombre,
          rubros,
          zonas,
          aniosExperiencia: Number(anios) || 0,
          descripcion,
          disponibilidad,
          whatsapp,
          transcripcion: relato,
          idCliente: idCliente.current,
          cuenta: leerCuenta()?.clave,
        }),
        espera: 45_000,
      });
      guardarPrestadorId(datos.prestador.id);
      recordarPrestador(datos.prestador);
      router.replace(destino);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu perfil. Probá de nuevo.");
      setGuardando(false);
    }
  }

  function alternar<T>(lista: T[], valor: T) {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  if (paso === "armando") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink">Armando tu perfil</h1>
        <p className="text-[17px] text-ink-500">Tarda unos segundos.</p>
      </main>
    );
  }

  if (paso === "revisar") {
    // Primero lo que ya tiene marcado, después el resto, para que no tenga que buscar.
    const rubrosOrdenados = [...RUBROS].sort((a, b) => Number(rubros.includes(b.id)) - Number(rubros.includes(a.id)));
    const zonasOrdenadas = [...new Set([...zonas, ...ZONAS])];
    return (
      <Pantalla
        pie={
          <>
            {(faltas.nombre || faltas.rubros || faltas.whatsapp) && <Falta>Revisá lo marcado en rojo</Falta>}
            <BotonPrimario onClick={guardar} cargando={guardando}>
              {pedidoPendiente ? "Guardar y presupuestar" : "Guardar y ver pedidos"}
            </BotonPrimario>
            <p className="mt-2 text-center text-[15px] text-ink-500">Anotarte y presupuestar es gratis.</p>
          </>
        }
      >
        <Cabecera alVolver={() => setPaso("contar")} />
        <Titulo pregunta={fuente === "ia" ? "Lo armamos con lo que contaste. ¿Está bien?" : "No pudimos usar la IA. Completalo vos."}>Revisá tu perfil</Titulo>

        <Campo etiqueta="Nombre y apellido" error={faltas.nombre}>
          <input className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} />
        </Campo>

        <div className="mt-6">
          <span className="text-sm font-semibold text-ink">¿Qué trabajos hacés?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {rubrosOrdenados.map((rubro) => (
              <Chip key={rubro.id} activo={rubros.includes(rubro.id)} onClick={() => setRubros((lista) => alternar(lista, rubro.id))}>
                {rubro.nombre}
              </Chip>
            ))}
          </div>
          {faltas.rubros && (
            <span role="alert" className="mt-2 block text-sm font-medium text-danger">
              {faltas.rubros}
            </span>
          )}
        </div>

        <div className="mt-6">
          <span className="text-sm font-semibold text-ink">¿En qué barrios?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {zonasOrdenadas.map((zona) => (
              <Chip key={zona} activo={zonas.includes(zona)} onClick={() => setZonas((lista) => alternar(lista, zona))}>
                {zona}
              </Chip>
            ))}
          </div>
        </div>

        <Campo etiqueta="Sobre tu trabajo" ayuda="Lo leen los vecinos antes de elegirte.">
          <textarea className={`${claseCampo} min-h-24 resize-none`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400} />
        </Campo>

        <Campo etiqueta="Años de experiencia">
          <input className={claseCampo} value={anios} onChange={(e) => setAnios(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="Ej: 10" />
        </Campo>

        <Campo etiqueta="Tu celular (opcional)" error={faltas.whatsapp} ayuda="No se le muestra a nadie. Los vecinos te escriben por el chat de la app.">
          <input className={claseCampo} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="388 4123456" />
        </Campo>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  return (
    <Pantalla pie={<BotonPrimario onClick={armarPerfil} disabled={relato.trim().length < 10}>Continuar</BotonPrimario>}>
      <Cabecera volver={pedidoPendiente ? "/prestador" : "/"} />
      <Titulo pregunta="Decí tu nombre, tus oficios y en qué barrios trabajás.">Contanos qué hacés</Titulo>
      <div className="mt-7">
      <CajaRelato
        valor={relato}
        alCambiar={setRelato}
        invitacion="Tocá y hablá"
        ejemplo="Ej: soy Juan Mamaní, plomero y gasista. Trabajo hace 15 años en Alto Comedero y Palpalá."
        alDetener={guardarTerminar}
      />
      </div>
      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
    </Pantalla>
  );
}
