import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonSecundario, Cabecera, Campo, Cargando, ErrorDePantalla, Icono, Pantalla, SinConexion, Titulo, claseCampo } from "@/components/ui";
import { pedir } from "@/lib/cliente";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { useRouter } from "@/lib/navegacion";

type Tipo = "dni" | "matricula";

const PASOS: Record<Tipo, { titulo: string; pregunta: string; fotos: { etiqueta: string; ayuda: string }[] }> = {
  dni: {
    titulo: "Verificá tu identidad",
    pregunta: "Con dos fotos. Las ve solo el equipo de NecesitoYa, nunca los vecinos.",
    fotos: [
      { etiqueta: "Frente del DNI", ayuda: "Que se lean el nombre y el número." },
      { etiqueta: "Tu cara con el DNI", ayuda: "Una selfie sosteniendo el DNI al lado de tu cara." },
    ],
  },
  matricula: {
    titulo: "Verificá tu oficio",
    pregunta: "Con la foto de tu matrícula o del certificado del curso. La revisamos a mano.",
    fotos: [{ etiqueta: "Matrícula o certificado", ayuda: "Que se lean tu nombre y el oficio." }],
  },
};

// Trámite de verificación: las fotos que pide y un solo botón. Lo revisa el equipo y el prestador ve el resultado en su perfil.
export default function VerificarPrestador() {
  const router = useRouter();
  const [parametros] = useSearchParams();
  const tipo: Tipo = parametros.get("tipo") === "matricula" ? "matricula" : "dni";
  const paso = PASOS[tipo];
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [fotos, setFotos] = useState<(FotoLista | null)[]>(paso.fotos.map(() => null));
  const [numero, setNumero] = useState("");
  const [preparando, setPreparando] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const entradas = useRef<(HTMLInputElement | null)[]>([]);

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando || !prestador) return <Cargando />;

  async function elegir(indice: number, archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setPreparando(indice);
    try {
      const foto = await achicarFoto(archivo);
      setFotos((actuales) => actuales.map((f, i) => (i === indice ? foto : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos usar esa foto. Probá con otra.");
    } finally {
      setPreparando(null);
      const entrada = entradas.current[indice];
      if (entrada) entrada.value = "";
    }
  }

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      await pedir("/api/verificacion", {
        method: "POST",
        body: JSON.stringify({ prestadorId: prestador?.id, tipo, numero, documentos: fotos.map((f) => f && { tipo: f.tipo, base64: f.base64 }) }),
        espera: 60_000,
      });
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandarlo. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/prestador/perfil")}>Volver a mi perfil</BotonPrimario>}>
        <Cabecera volver="/prestador/perfil" cerrar />
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-success">
            <Icono nombre="check" size={36} />
          </span>
          <h1 className="mt-4 text-[28px] font-bold leading-tight text-ink">Lo estamos revisando</h1>
          <p className="mt-2 text-[17px] text-ink-500">Cuando esté listo, en tu perfil y en tus presupuestos va a decir “Verificado”.</p>
        </div>
      </Pantalla>
    );
  }

  const faltan = fotos.filter((f) => !f).length;
  return (
    <Pantalla
      pie={
        <>
          {faltan > 0 && <p className="mb-2 text-center text-[15px] font-medium text-ink-500">{faltan === 1 ? "Falta una foto" : `Faltan ${faltan} fotos`}</p>}
          <BotonPrimario onClick={enviar} disabled={faltan > 0} cargando={enviando}>
            Mandar para revisar
          </BotonPrimario>
        </>
      }
    >
      <Cabecera volver="/prestador/perfil" />
      <Titulo pregunta={paso.pregunta}>{paso.titulo}</Titulo>

      {paso.fotos.map((pedidoDeFoto, i) => (
        <div key={pedidoDeFoto.etiqueta} className="mt-8">
          <p className="text-base font-semibold text-ink">{pedidoDeFoto.etiqueta}</p>
          <p className="text-[15px] text-ink-500">{pedidoDeFoto.ayuda}</p>
          <input
            ref={(el) => {
              entradas.current[i] = el;
            }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => elegir(i, e.target.files?.[0])}
          />
          <div className="mt-3">
            {fotos[i] ? (
              <div className="flex items-center gap-4">
                <img src={fotos[i]?.vistaPrevia} alt={pedidoDeFoto.etiqueta} className="h-20 w-28 rounded-2xl object-cover" />
                <button type="button" onClick={() => entradas.current[i]?.click()} className="flex min-h-12 items-center text-base font-semibold text-brand">
                  Cambiar
                </button>
              </div>
            ) : (
              <BotonSecundario onClick={() => entradas.current[i]?.click()} disabled={preparando === i}>
                <Icono nombre="camara" size={20} />
                {preparando === i ? "Preparando la foto" : "Sacar la foto"}
              </BotonSecundario>
            )}
          </div>
        </div>
      ))}

      {tipo === "matricula" && (
        <Campo etiqueta="Número de matrícula (si tiene)">
          <input className={claseCampo} value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} />
        </Campo>
      )}
      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
    </Pantalla>
  );
}
