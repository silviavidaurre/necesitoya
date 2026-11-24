import { useEffect, useState } from "react";
import { usePrestador } from "@/components/usePrestador";
import { BotonPrimario, Cabecera, Campo, Cargando, Chip, ErrorDePantalla, Pantalla, SinConexion, Titulo, claseCampo } from "@/components/ui";
import { RUBROS, ZONAS, type RubroId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";
import { billeteraValida } from "@/lib/stellar";

// Editar el perfil: los mismos datos del alta, ya cargados, y un solo botón para guardar.
export default function EditarPerfil() {
  const router = useRouter();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [listo, setListo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rubros, setRubros] = useState<RubroId[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [anios, setAnios] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [billetera, setBilletera] = useState("");
  const [faltas, setFaltas] = useState<{ nombre?: string; rubros?: string; whatsapp?: string; billetera?: string }>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!prestador || listo) return;
    setNombre(prestador.nombre);
    setRubros(prestador.rubros);
    setZonas(prestador.zonas);
    setAnios(prestador.aniosExperiencia > 0 ? String(prestador.aniosExperiencia) : "");
    setDescripcion(prestador.descripcion);
    setDisponibilidad(prestador.disponibilidad);
    setWhatsapp(prestador.whatsapp);
    setBilletera(prestador.billetera ?? "");
    setListo(true);
  }, [prestador, listo]);

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando || !prestador || !listo) return <Cargando />;

  function alternar<T>(lista: T[], valor: T) {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  async function guardar() {
    const nuevas: typeof faltas = {};
    if (nombre.trim().length < 2) nuevas.nombre = "Escribí tu nombre y apellido.";
    if (rubros.length === 0) nuevas.rubros = "Elegí al menos un oficio.";
    if (whatsapp.trim() && whatsapp.replace(/\D/g, "").length < 8) nuevas.whatsapp = "Escribilo con la característica, por ejemplo 388 4123456. O dejalo vacío.";
    if (billetera.trim() && !billeteraValida(billetera.trim().toUpperCase())) nuevas.billetera = "Revisala: empieza con G y tiene 56 letras y números. Copiala de tu billetera.";
    setFaltas(nuevas);
    if (Object.keys(nuevas).length > 0) return;

    setError("");
    setGuardando(true);
    try {
      await pedir("/api/prestadores", {
        method: "POST",
        body: JSON.stringify({ id: prestador?.id, nombre, rubros, zonas, aniosExperiencia: Number(anios) || 0, descripcion, disponibilidad, whatsapp, billetera: billetera.trim().toUpperCase() }),
      });
      router.replace("/prestador/perfil");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar los cambios. Probá de nuevo.");
      setGuardando(false);
    }
  }

  const rubrosOrdenados = [...RUBROS].sort((a, b) => Number(rubros.includes(b.id)) - Number(rubros.includes(a.id)));
  const zonasOrdenadas = [...new Set([...zonas, ...ZONAS])];

  return (
    <Pantalla
      pie={
        <BotonPrimario onClick={guardar} cargando={guardando}>
          Guardar cambios
        </BotonPrimario>
      }
    >
      <Cabecera volver="/prestador/perfil" />
      <Titulo pregunta="Así te ven los vecinos.">Editar perfil</Titulo>

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
      <Campo etiqueta="Días y horarios">
        <input className={claseCampo} value={disponibilidad} onChange={(e) => setDisponibilidad(e.target.value)} maxLength={120} placeholder="Ej: lunes a sábado" />
      </Campo>
      <Campo etiqueta="Tu celular (opcional)" error={faltas.whatsapp} ayuda="No se le muestra a nadie. Los vecinos te escriben por el chat de la app.">
        <input className={claseCampo} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" />
      </Campo>

      <Campo
        etiqueta="Billetera para cobrar por la app (opcional)"
        error={faltas.billetera}
        ayuda="Tu dirección Stellar (empieza con G). Ahí te llegan los pagos de la app en USDC. Tiene que aceptar USDC."
      >
        <input
          className={`${claseCampo} font-mono text-[15px]`}
          value={billetera}
          onChange={(e) => setBilletera(e.target.value.replace(/\s/g, ""))}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={56}
          placeholder="G..."
        />
      </Campo>

      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
    </Pantalla>
  );
}
