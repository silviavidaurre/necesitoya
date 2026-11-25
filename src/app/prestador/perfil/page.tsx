import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { Avatar } from "@/components/Avatar";
import { PantallaEliminarCuenta } from "@/components/EliminarCuenta";
import { EntrarACuenta, cerrarCuenta } from "@/components/EntrarACuenta";
import { HojaDeAbajo, OpcionDeHoja } from "@/components/Hoja";
import { NavPrestador } from "@/components/NavPrestador";
import { recordarPrestador, usePrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonSecundario, Cargando, ErrorDePantalla, Estado, Icono, Pantalla, SinConexion, Titulo } from "@/components/ui";
import { rubroPorId } from "@/lib/catalogo";
import { borrarPrestadorId, leerCuenta, pedir, type CuentaGuardada } from "@/lib/cliente";
import { achicarFoto } from "@/lib/imagen";
import { Link, useRouter } from "@/lib/navegacion";
import { MAX_FOTOS } from "@/lib/reglas";
import type { PerfilPublico } from "@/lib/tipos";

// El mismo contacto que figura en los términos y en la privacidad.
const CONTACTO = "gabriel13iturre@gmail.com";

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

type Hoja = "publico" | "verificacion" | "cobros" | "avisos" | "ayuda" | "legales" | null;

function Insignia({ children, bien = false }: { children: ReactNode; bien?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] font-bold ${bien ? "bg-success-50 text-success" : "bg-subtle font-semibold text-ink"}`}>
      {bien && <Icono nombre="check" size={13} />}
      {children}
    </span>
  );
}

function Numero({ valor, texto }: { valor: ReactNode; texto: string }) {
  return (
    <div className="rounded-2xl bg-subtle p-3">
      <span className="cifra flex items-center gap-1 text-[26px] font-bold leading-tight text-ink">{valor}</span>
      <span className="block text-xs leading-snug text-ink-500">{texto}</span>
    </div>
  );
}

// Perfil del prestador: nombre, insignias (verificado, matriculado, oficios) y los números reales de su perfil público
// (trabajos terminados, cobrados por la app y reseñas). Accesos en grilla y, abajo, avisos, ayuda, lo legal,
// eliminar la cuenta y cerrar sesión.
export default function PerfilPrestador() {
  const router = useRouter();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador();
  useEffect(() => {
    document.title = "Mi perfil · NecesitoYa";
  }, []);
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [compartido, setCompartido] = useState(false);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [eliminando, setEliminando] = useState(false);
  const [cuenta, setCuenta] = useState<CuentaGuardada | null>(null);
  useEffect(() => setCuenta(leerCuenta()), []);
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
  if (cargando || !prestador || !perfil)
    return error ? (
      // Sin señal: una frase, reintentar y la barra para ir a otra pestaña (no una pantalla sin salida).
      <>
        <SinConexion
          alReintentar={() => {
            setError("");
            void cargar();
          }}
        />
        <NavPrestador />
      </>
    ) : (
      <Cargando />
    );

  const enlace = `${window.location.origin}/p/${prestador.idPublico}`;
  const texto = `Soy ${prestador.nombre}. Pedime presupuesto por NecesitoYa:`;
  const { reputacion } = perfil;

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
    if (cuenta) return cerrarCuenta();
    // Sin cuenta ni contraseña, salir es perder el acceso al perfil desde este celular: se pregunta antes.
    if (!window.confirm("Si salís, no vas a poder volver a entrar a este perfil desde este celular. ¿Salir igual?")) return;
    borrarPrestadorId();
    recordarPrestador(null);
    router.replace("/");
  }

  const accesos: { id: Exclude<Hoja, null> | "editar"; texto: string; icono: string }[] = [
    { id: "publico", texto: "Perfil público", icono: "compartir" },
    { id: "verificacion", texto: "Verificación", icono: "escudo" },
    { id: "editar", texto: "Oficios y zonas", icono: "pin" },
    { id: "cobros", texto: "Cobros", icono: "tarjeta" },
  ];

  return (
    <>
      <Pantalla conNav>
        <div className="mt-6 flex items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <Titulo>{perfil.nombre}</Titulo>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!perfil.ejemplo && prestador.nivel >= 2 && <Insignia bien>Verificado</Insignia>}
              {!perfil.ejemplo && prestador.nivel >= 3 && <Insignia>Matriculado</Insignia>}
              {perfil.rubros.map((id) => (
                <Insignia key={id}>{rubroPorId(id).nombre}</Insignia>
              ))}
            </div>
          </div>
          <Avatar nombre={perfil.nombre} size={72} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Numero valor={reputacion.terminados} texto={reputacion.terminados === 1 ? "Trabajo terminado" : "Trabajos terminados"} />
          <Numero valor={reputacion.cobrados} texto="Cobrados por la app" />
          <Numero
            valor={
              reputacion.promedio !== null ? (
                <>
                  {reputacion.promedio.toFixed(1).replace(".", ",")}
                  <Icono nombre="estrella" size={18} />
                </>
              ) : (
                "–"
              )
            }
            texto={reputacion.calificaciones === 0 ? "Sin reseñas todavía" : `${reputacion.calificaciones} ${reputacion.calificaciones === 1 ? "reseña" : "reseñas"}`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {accesos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => (a.id === "editar" ? router.push("/prestador/editar") : setHoja(a.id))}
              className="flex h-[60px] items-center gap-3 rounded-2xl bg-subtle px-3.5 text-left text-[15px] font-semibold text-ink active:bg-line"
            >
              <Icono nombre={a.icono} size={22} className="shrink-0" />
              {a.texto}
            </button>
          ))}
        </div>

        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {!cuenta && <EntrarACuenta motivo="Para no perder tu perfil si cambiás de celular." />}

        <nav aria-label="Más" className="mt-3 flex flex-col">
          <FilaDeLista onClick={() => setHoja("avisos")}>Avisos</FilaDeLista>
          <FilaDeLista onClick={() => setHoja("ayuda")}>Ayuda</FilaDeLista>
          <FilaDeLista onClick={() => setHoja("legales")}>Términos y privacidad</FilaDeLista>
          {cuenta && <FilaDeLista onClick={() => setEliminando(true)}>Eliminar la cuenta</FilaDeLista>}
          <button type="button" onClick={salir} className="flex min-h-[52px] items-center text-left text-base font-semibold text-ink">
            {cuenta ? "Cerrar sesión" : "Salir de este perfil en este celular"}
          </button>
        </nav>
      </Pantalla>

      {hoja === "publico" && (
        <HojaDeAbajo titulo="Perfil público" alCerrar={() => setHoja(null)}>
          <p className="text-[15px] text-ink-500">Es lo que ven los vecinos: tus oficios, tus trabajos y tus reseñas.</p>
          <div className="mt-3 flex flex-col gap-2">
            <BotonPrimario onClick={compartir}>
              <Icono nombre={compartido ? "check" : "compartir"} size={20} />
              {compartido ? "Enlace copiado" : "Compartir mi perfil"}
            </BotonPrimario>
            <Link href={`/p/${prestador.idPublico}`} className="flex min-h-12 items-center justify-center text-[15px] font-semibold text-brand">
              Ver cómo lo ven los vecinos
            </Link>
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">Fotos de trabajos</h3>
          <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={(e) => sumarFoto(e.target.files?.[0])} />
          {perfil.fotos.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {perfil.fotos.map((fotoId, i) => (
                <div key={fotoId} className="relative">
                  <img src={`/api/fotos?id=${fotoId}`} alt={`Foto de trabajo ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => quitarFoto(fotoId)}
                    aria-label={`Quitar la foto ${i + 1}`}
                    className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white"
                  >
                    <Icono nombre="cerrar" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
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
        </HojaDeAbajo>
      )}

      {hoja === "verificacion" && (
        <HojaDeAbajo titulo="Verificación" alCerrar={() => setHoja(null)}>
          <p className="text-[15px] text-ink-500">Cada paso suma frente al vecino. Lo revisamos a mano.</p>
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
          </div>
        </HojaDeAbajo>
      )}

      {hoja === "cobros" && (
        <HojaDeAbajo titulo="Cobros" alCerrar={() => setHoja(null)}>
          <p className="text-[15px] text-ink-500">Con un medio de cobro cargado, los vecinos te pueden pagar por la app.</p>
          <div className="mt-1 divide-y divide-line">
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
                <p className="text-sm text-ink-500">{prestador.billetera ? "Billetera cargada. Te pueden pagar por la app." : "Cargá tu billetera Stellar en Editar perfil."}</p>
              </div>
              {prestador.billetera ? <Estado tono="bien">Listo</Estado> : <Estado>Pendiente</Estado>}
            </button>
          </div>
          <p className="mt-3 text-sm text-ink-500">
            Cobrados por la app hasta ahora: <span className="cifra font-bold text-ink">{reputacion.cobrados}</span>
          </p>
        </HojaDeAbajo>
      )}

      {hoja === "avisos" && (
        <HojaDeAbajo titulo="Avisos" alCerrar={() => setHoja(null)}>
          <p className="text-[15px] leading-snug text-ink">Te avisamos en este celular cuando te eligen o te escriben.</p>
          {cuenta ? <ActivarAvisos para="¿Te avisamos en este celular?" /> : <p className="mt-3 text-[15px] text-ink-500">Para recibir avisos, primero entrá con tu cuenta.</p>}
        </HojaDeAbajo>
      )}

      {hoja === "ayuda" && (
        <HojaDeAbajo titulo="Ayuda" alCerrar={() => setHoja(null)}>
          <OpcionDeHoja icono="lista" titulo="Un problema con un trabajo" detalle="En Presupuestos, abrilo y tocá Problema" onClick={() => router.push("/prestador/ofertas")} />
          <OpcionDeHoja icono="mensaje" titulo="Escribirnos" detalle={CONTACTO} onClick={() => (window.location.href = `mailto:${CONTACTO}`)} />
        </HojaDeAbajo>
      )}

      {hoja === "legales" && (
        <HojaDeAbajo titulo="Términos y privacidad" alCerrar={() => setHoja(null)}>
          <OpcionDeHoja icono="lista" titulo="Términos y condiciones" onClick={() => router.push("/terminos")} />
          <OpcionDeHoja icono="candado" titulo="Privacidad" onClick={() => router.push("/privacidad")} />
        </HojaDeAbajo>
      )}

      {eliminando && <PantallaEliminarCuenta alCerrar={() => setEliminando(false)} />}
      <NavPrestador />
    </>
  );
}

function FilaDeLista({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center justify-between border-b border-line text-left text-base text-ink">
      {children}
      <Icono nombre="chevron" size={20} className="text-ink-500" />
    </button>
  );
}
