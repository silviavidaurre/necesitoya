import { useCallback, useEffect, useRef, useState } from "react";
import { FichaPrestador } from "@/components/FichaPrestador";
import { NavPrestador } from "@/components/NavPrestador";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { recordarPrestador, usePrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonSecundario, Cargando, ErrorDePantalla, Estado, Icono, Pantalla, Seccion, SinConexion } from "@/components/ui";
import { borrarPrestadorId, pedir } from "@/lib/cliente";
import { achicarFoto } from "@/lib/imagen";
import { useRouter } from "@/lib/navegacion";
import { MAX_FOTOS } from "@/lib/reglas";
import type { PerfilPublico } from "@/lib/tipos";

// La confianza se gana por escalones: se empieza a trabajar con el primero
// y cada uno suma frente al vecino, en vez de exigir todo antes del primer pedido.
const NIVELES = [
  { nivel: 1, titulo: "Celular cargado", detalle: "Opcional. No se le muestra a nadie" },
  { nivel: 2, titulo: "Identidad verificada", detalle: "Con tu DNI. Muy pronto" },
  { nivel: 3, titulo: "Oficio certificado", detalle: "Curso o matrícula. Muy pronto" },
];

export default function PerfilPrestador() {
  const router = useRouter();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [compartido, setCompartido] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);

  // El id secreto (prestadorId) solo se usa para cambiar cosas propias. Para mostrar y compartir va el público.
  const prestadorId = prestador?.id;
  const idPublico = prestador?.idPublico;
  const cargar = useCallback(async () => {
    if (!idPublico) return;
    try {
      const datos = await pedir<{ perfil: PerfilPublico }>(`/api/perfil?id=${encodeURIComponent(idPublico)}`);
      setPerfil(datos.perfil);
    } catch {
      setError("Sin conexión. No pudimos actualizar tu perfil.");
    }
  }, [idPublico]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando || !prestador || !perfil) return error ? <Pantalla conNav><ErrorDePantalla>{error}</ErrorDePantalla></Pantalla> : <Cargando />;

  const enlace = `${window.location.origin}/p/${prestador.idPublico}`;
  const texto = `Soy ${prestador.nombre}. Pedime presupuesto por NecesitoYa:`;

  async function compartir() {
    setError("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "NecesitoYa", text: texto, url: enlace });
        return;
      }
      await navigator.clipboard.writeText(`${texto} ${enlace}`);
      setCompartido(true);
      setTimeout(() => setCompartido(false), 2500);
    } catch (e) {
      // Si la persona cierra el menú de compartir no es un error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("No pudimos compartir. Copiá el enlace a mano: " + enlace);
    }
  }

  async function sumarFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setSubiendo(true);
    try {
      const foto = await achicarFoto(archivo);
      await pedir("/api/prestadores/fotos", { method: "POST", body: JSON.stringify({ id: prestadorId, foto: { tipo: foto.tipo, base64: foto.base64 } }) });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir la foto. Probá con otra.");
    } finally {
      setSubiendo(false);
      if (entradaFoto.current) entradaFoto.current.value = "";
    }
  }

  async function quitarFoto(fotoId: string) {
    setError("");
    try {
      await pedir("/api/prestadores/fotos", { method: "POST", body: JSON.stringify({ id: prestadorId, quitar: fotoId }) });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos quitar la foto.");
    }
  }

  function salir() {
    // Sin cuenta ni contraseña, salir es perder el acceso al perfil desde este celular: se pregunta antes.
    if (!window.confirm("Si salís, no vas a poder volver a entrar a este perfil desde este celular. ¿Salir igual?")) return;
    borrarPrestadorId();
    recordarPrestador(null);
    router.replace("/");
  }

  return (
    <>
      <Pantalla conNav>
        <FichaPrestador
          perfil={perfil}
          acciones={
            <>
              <BotonPrimario onClick={compartir}>
                <Icono nombre={compartido ? "check" : "compartir"} size={20} />
                {compartido ? "Enlace copiado" : "Compartir mi perfil"}
              </BotonPrimario>
              <BotonSecundario onClick={() => router.push("/prestador/editar")}>
                <Icono nombre="editar" size={20} />
                Editar perfil
              </BotonSecundario>
              {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
            </>
          }
          fotosExtra={
            <div className="mt-3">
              <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={(e) => sumarFoto(e.target.files?.[0])} />
              {perfil.fotos.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {perfil.fotos.map((fotoId, i) => (
                    <button key={fotoId} type="button" onClick={() => quitarFoto(fotoId)} className="h-11 text-sm font-semibold text-ink-500">
                      Quitar foto {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {perfil.fotos.length < MAX_FOTOS ? (
                <BotonSecundario onClick={() => entradaFoto.current?.click()} disabled={subiendo}>
                  <Icono nombre="camara" size={20} />
                  {subiendo ? "Subiendo la foto" : "Sumar foto de un trabajo"}
                </BotonSecundario>
              ) : (
                <p className="text-[13px] text-ink-500">Tenés las {MAX_FOTOS} fotos. Quitá una para cambiarla.</p>
              )}
              {perfil.fotos.length === 0 && <p className="mt-2 text-[13px] text-ink-500">Los vecinos eligen más a quien muestra su trabajo.</p>}
            </div>
          }
        />

        <Seccion>Tu confianza</Seccion>
        <div className="mt-1 divide-y divide-line">
          {NIVELES.map((n) => (
            <div key={n.nivel} className="flex min-h-16 items-center justify-between gap-4 py-3">
              <div>
                <p className="text-base font-semibold text-ink">{n.titulo}</p>
                <p className="text-sm text-ink-500">{n.detalle}</p>
              </div>
              {(n.nivel === 1 ? Boolean(prestador.whatsapp) : prestador.nivel >= n.nivel) ? <Estado tono="bien">Listo</Estado> : <Estado>Pendiente</Estado>}
            </div>
          ))}
        </div>

        <EntrarACuenta motivo="Para no perder tu perfil si cambiás de celular." />

        <button type="button" onClick={salir} className="mt-4 flex min-h-14 items-center gap-3 text-base font-semibold text-danger">
          <Icono nombre="salir" size={22} />
          Salir de este perfil en este celular
        </button>
      </Pantalla>
      <NavPrestador />
    </>
  );
}
