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
  { tipo: "dni" as const, titulo: "Identidad verificada", detalle: "Con tu DNI y una selfie" },
  { tipo: "matricula" as const, titulo: "Oficio certificado", detalle: "Matrícula o certificado del curso" },
];

interface Tramite {
  tipo: "dni" | "matricula";
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo: string;
}

export default function PerfilPrestador() {
  const router = useRouter();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [compartido, setCompartido] = useState(false);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  // Qué medios de pago tiene configurados el servidor: solo se ofrece conectar los que existen.
  const [medios, setMedios] = useState<{ cosmos: boolean; mercadopago: boolean }>({ cosmos: false, mercadopago: false });
  useEffect(() => {
    pedir<{ cosmos?: boolean; mercadopago?: boolean }>("/api/stats")
      .then((s) => setMedios({ cosmos: Boolean(s.cosmos), mercadopago: Boolean(s.mercadopago) }))
      .catch(() => undefined);
  }, []);

  async function conectarMercadoPago() {
    setError("");
    try {
      const { url } = await pedir<{ url: string }>("/api/mercadopago/conectar", { method: "POST", body: JSON.stringify({ prestadorId: prestador?.id }) });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos abrir Mercado Pago.");
    }
  }
  const entradaFoto = useRef<HTMLInputElement>(null);

  // El id secreto (prestadorId) solo se usa para cambiar cosas propias. Para mostrar y compartir va el público.
  const prestadorId = prestador?.id;
  const idPublico = prestador?.idPublico;
  const cargar = useCallback(async () => {
    if (!idPublico) return;
    try {
      const datos = await pedir<{ perfil: PerfilPublico }>(`/api/perfil?id=${encodeURIComponent(idPublico)}`);
      setPerfil(datos.perfil);
      if (prestadorId) {
        const verificacion = await pedir<{ tramites: Tramite[] }>(`/api/verificacion?prestadorId=${encodeURIComponent(prestadorId)}`).catch(() => null);
        if (verificacion) setTramites(verificacion.tramites);
      }
    } catch {
      setError("Sin conexión. No pudimos actualizar tu perfil.");
    }
  }, [idPublico, prestadorId]);

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
          {NIVELES.map((n) => {
            // El último trámite de ese tipo dice en qué está; el nivel del perfil confirma lo aprobado.
            const ultimo = tramites.find((t) => t.tipo === n.tipo);
            const listo = n.tipo === "dni" ? prestador.nivel >= 2 : prestador.nivel >= 3 || ultimo?.estado === "aprobada";
            const detalle = listo
              ? n.tipo === "matricula" && prestador.nivel < 3
                ? "Aprobado. Se ve cuando verifiques tu identidad"
                : n.detalle
              : ultimo?.estado === "pendiente"
                ? "Lo estamos revisando"
                : ultimo?.estado === "rechazada"
                  ? `No se aprobó: ${ultimo.motivo}. Probá de nuevo`
                  : n.detalle;
            const puedeMandar = !listo && ultimo?.estado !== "pendiente";
            return (
              <button
                key={n.tipo}
                type="button"
                disabled={!puedeMandar}
                onClick={() => router.push(`/prestador/verificar?tipo=${n.tipo}`)}
                className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left"
              >
                <div>
                  <p className="text-base font-semibold text-ink">{n.titulo}</p>
                  <p className="text-sm text-ink-500">{detalle}</p>
                </div>
                {listo ? <Estado tono="bien">Listo</Estado> : ultimo?.estado === "pendiente" ? <Estado>En revisión</Estado> : ultimo?.estado === "rechazada" ? <Estado tono="mal">Rechazado</Estado> : <Estado>Pendiente</Estado>}
              </button>
            );
          })}
          {medios.mercadopago && (
            <button type="button" onClick={prestador.conMercadoPago ? undefined : conectarMercadoPago} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left">
              <div>
                <p className="text-base font-semibold text-ink">Cobrar con Mercado Pago</p>
                <p className="text-sm text-ink-500">{prestador.conMercadoPago ? "Cuenta conectada. Te pagan en pesos." : "Conectá tu cuenta y te pagan en pesos por la app."}</p>
              </div>
              {prestador.conMercadoPago ? <Estado tono="bien">Listo</Estado> : <Estado>Conectar</Estado>}
            </button>
          )}
          <button type="button" onClick={() => router.push("/prestador/editar")} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left">
            <div>
              <p className="text-base font-semibold text-ink">Cobrar por la app</p>
              <p className="text-sm text-ink-500">{prestador.billetera ? "Billetera cargada. Te pagan protegido." : "Cargá tu billetera Stellar en Editar perfil."}</p>
            </div>
            {prestador.billetera ? <Estado tono="bien">Listo</Estado> : <Estado>Pendiente</Estado>}
          </button>
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
