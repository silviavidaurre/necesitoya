import { useEffect, useState, type ReactNode } from "react";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { Avatar } from "@/components/Avatar";
import { NavVecino } from "@/components/BarraFlotante";
import { ChipBarrio } from "@/components/Barrio";
import { PantallaEliminarCuenta } from "@/components/EliminarCuenta";
import { EntrarACuenta, cerrarCuenta } from "@/components/EntrarACuenta";
import { HojaDeAbajo } from "@/components/Hoja";
import { Icono, Pantalla, Titulo } from "@/components/ui";
import { guardarMisDatos, leerCuenta, leerMisDatos, leerPrestadorId, type CuentaGuardada } from "@/lib/cliente";
import { Link } from "@/lib/navegacion";
import { versionDeLaApp } from "@/integraciones/capacitor-android/nativo";

// El mismo contacto que figura en los términos y en la privacidad.
const CONTACTO = "gabriel13iturre@gmail.com";

type Hoja = "ayuda" | "pagos" | "avisos" | "seguridad" | null;

function Punto({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] leading-snug text-ink">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

// Cuenta del vecino: quién es, su barrio, accesos en grilla (ayuda, pagos, avisos, seguridad), la invitación a
// ofrecer su oficio, lo legal, eliminar la cuenta y cerrar sesión. Sin cuenta, entrar o crearla.
export default function Cuenta() {
  const [cuenta, setCuenta] = useState<CuentaGuardada | null>(null);
  const [cargada, setCargada] = useState(false);
  const [zona, setZona] = useState("");
  const [esPrestador, setEsPrestador] = useState(false);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [eliminando, setEliminando] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    setCuenta(leerCuenta());
    setZona(leerMisDatos().zona);
    setEsPrestador(Boolean(leerPrestadorId()));
    setCargada(true);
    void versionDeLaApp().then(setVersion);
    document.title = "Cuenta · NecesitoYa";
  }, []);

  const accesos: { id: Exclude<Hoja, null>; texto: string; icono: string }[] = [
    { id: "ayuda", texto: "Ayuda", icono: "ayuda" },
    { id: "pagos", texto: "Pagos", icono: "tarjeta" },
    { id: "avisos", texto: "Avisos", icono: "campana" },
    { id: "seguridad", texto: "Seguridad", icono: "escudo" },
  ];

  return (
    <>
      <Pantalla conNav>
        {cuenta ? (
          <div className="mt-6 flex items-center gap-3.5">
            <div className="min-w-0 flex-1">
              <Titulo>{cuenta.nombre}</Titulo>
              <div className="mt-2">
                <ChipBarrio
                  zona={zona}
                  sinElegir="Elegí tu barrio"
                  alCambiar={(nueva) => {
                    setZona(nueva);
                    guardarMisDatos({ zona: nueva });
                  }}
                />
              </div>
            </div>
            <Avatar nombre={cuenta.nombre} size={72} />
          </div>
        ) : (
          <div className="mt-6">
            <Titulo pregunta="Para seguir tus pedidos desde cualquier celular y no perderlos.">Cuenta</Titulo>
          </div>
        )}

        {cargada && !cuenta && <EntrarACuenta abiertoAlInicio titulo="Entrá o creá tu cuenta" motivo="Con tu mail o con Google." />}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {accesos.map((a) => (
            <button key={a.id} type="button" onClick={() => setHoja(a.id)} className="flex h-16 items-center gap-3 rounded-2xl bg-subtle px-4 text-left text-base font-semibold text-ink active:bg-line">
              <Icono nombre={a.icono} size={22} />
              {a.texto}
            </button>
          ))}
        </div>

        <Link href="/prestador" className="mt-4 flex items-center gap-3.5 rounded-[18px] bg-subtle p-[18px] active:bg-line">
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold text-ink">{esPrestador ? "Tu lado de prestador" : "¿Tenés un oficio?"}</span>
            <span className="mt-1 block text-[15px] leading-snug text-ink-500">
              {esPrestador ? "Mirá los pedidos de tu barrio y tus presupuestos." : "Recibí pedidos de tu barrio y cobrá por la app."}
            </span>
          </span>
          <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-acento text-[#0d0d0d]" aria-hidden="true">
            <Icono nombre={esPrestador ? "bandeja" : "carpinteria"} size={28} />
          </span>
        </Link>

        <nav aria-label="Más" className="mt-3 flex flex-col">
          <FilaDeLista href="/terminos">Términos y condiciones</FilaDeLista>
          <FilaDeLista href="/privacidad">Privacidad</FilaDeLista>
          {cuenta ? (
            <>
              <FilaDeLista onClick={() => setEliminando(true)}>Eliminar la cuenta</FilaDeLista>
              <button type="button" onClick={cerrarCuenta} className="flex min-h-[52px] items-center text-left text-base font-semibold text-ink">
                Cerrar sesión
              </button>
            </>
          ) : (
            <FilaDeLista href="/eliminar-cuenta">Cómo eliminar una cuenta</FilaDeLista>
          )}
        </nav>
        {version && <p className="mt-4 text-center text-[13px] text-ink-500">Versión {version}</p>}
      </Pantalla>

      {hoja === "ayuda" && (
        <HojaDeAbajo titulo="Ayuda" alCerrar={() => setHoja(null)}>
          <ul className="space-y-3">
            <Punto>¿Un problema con un trabajo? Abrí el pedido en Mis pedidos y tocá «Problema». Lo revisa el equipo.</Punto>
            <Punto>Para hablar con quien te presupuestó, usá el chat del pedido. Nadie ve tu teléfono.</Punto>
            <Punto>
              Para todo lo demás, escribinos a{" "}
              <a href={`mailto:${CONTACTO}`} className="font-semibold text-brand">
                {CONTACTO}
              </a>
              .
            </Punto>
          </ul>
        </HojaDeAbajo>
      )}
      {hoja === "pagos" && (
        <HojaDeAbajo titulo="Pagos" alCerrar={() => setHoja(null)}>
          <ul className="space-y-3">
            <Punto>Si el prestador cobra por la app, pagás desde el pedido cuando confirmás que quedó bien (o antes, si el pago es protegido y queda retenido).</Punto>
            <Punto>Pagás en la página del medio de pago. NecesitoYa no ve ni guarda tus datos de pago.</Punto>
            <Punto>La comisión de NecesitoYa es fija y va aparte. Si el prestador no cobra por la app, el pago lo arreglan por el chat.</Punto>
          </ul>
        </HojaDeAbajo>
      )}
      {hoja === "avisos" && (
        <HojaDeAbajo titulo="Avisos" alCerrar={() => setHoja(null)}>
          <p className="text-[15px] leading-snug text-ink">Te avisamos en este celular cuando llega un presupuesto, te escriben o cambia el estado del trabajo.</p>
          {cuenta ? (
            <ActivarAvisos para="¿Te avisamos en este celular?" />
          ) : (
            <p className="mt-3 text-[15px] text-ink-500">Para recibir avisos, primero entrá con tu cuenta.</p>
          )}
        </HojaDeAbajo>
      )}
      {hoja === "seguridad" && (
        <HojaDeAbajo titulo="Seguridad" alCerrar={() => setHoja(null)}>
          <ul className="space-y-3">
            <Punto>Nadie ve tu teléfono: todo se habla por el chat de la app, y los números que se escriban ahí se tapan.</Punto>
            <Punto>Tu dirección la ve solo el prestador que elegiste, mientras dura el trabajo. Al terminar se borra.</Punto>
            <Punto>Desde el chat podés denunciar o bloquear a alguien.</Punto>
            <Punto>Los prestadores «Verificado» mostraron su DNI, y los matriculados, su matrícula. Los revisamos a mano.</Punto>
          </ul>
          <Link href="/privacidad" className="mt-3 flex min-h-12 items-center text-[15px] font-semibold text-brand">
            Ver la política de privacidad
          </Link>
        </HojaDeAbajo>
      )}
      {eliminando && <PantallaEliminarCuenta alCerrar={() => setEliminando(false)} />}
      <NavVecino />
    </>
  );
}

function FilaDeLista({ children, href, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  const clase = "flex min-h-[52px] w-full items-center justify-between border-b border-line text-left text-base text-ink";
  const contenido = (
    <>
      {children}
      <Icono nombre="chevron" size={20} className="text-ink-500" />
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={clase}>
      {contenido}
    </button>
  );
}
