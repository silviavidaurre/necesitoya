import { useEffect, useRef, useState } from "react";
import { recordarPrestador } from "@/components/usePrestador";
import { PantallaEliminarCuenta } from "@/components/EliminarCuenta";
import { Link } from "@/lib/navegacion";
import { entrarConGoogleNativo, esAppNativa, googleNativoDisponible } from "@/lib/nativo";
import { BotonSecundario, Campo, claseCampo } from "@/components/ui";
import {
  borrarPrestadorId,
  guardarCuenta,
  guardarPrestadorId,
  leerCuenta,
  leerMisPedidos,
  leerPrestadorId,
  ErrorDePedido,
  pedir,
  reemplazarMisPedidos,
  type CuentaGuardada,
  type PedidoGuardado,
} from "@/lib/cliente";

interface RespuestaDeGoogle {
  credential?: string;
}

interface ApiDeGoogle {
  accounts: {
    id: {
      initialize(opciones: { client_id: string; callback: (respuesta: RespuestaDeGoogle) => void; ux_mode?: string; use_fedcm_for_button?: boolean }): void;
      renderButton(destino: HTMLElement, opciones: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: ApiDeGoogle;
  }
}

export interface Entrada {
  nombre: string;
  clave: string;
  nueva: boolean;
  demo?: boolean;
  prestadorId: string | null;
  pedidos: PedidoGuardado[];
}

// Lo que el servidor tiene configurado (Google y recuperar la contraseña por mail) se pide una sola vez por visita.
let configDeCuenta: Promise<{ google: string | null; recuperar: boolean }> | null = null;
function pedirConfigDeCuenta() {
  configDeCuenta ??= pedir<{ google: string | null; recuperar?: boolean }>("/api/cuenta")
    .then((datos) => ({ google: datos.google, recuperar: Boolean(datos.recuperar) }))
    .catch(() => {
      configDeCuenta = null;
      return { google: null, recuperar: false };
    });
  return configDeCuenta;
}
function pedirIdDeLaApp() {
  return pedirConfigDeCuenta().then((c) => c.google);
}

// El programa de Google que dibuja su botón se carga recién cuando hace falta.
let programa: Promise<void> | null = null;
function cargarPrograma() {
  programa ??= new Promise<void>((listo, fallo) => {
    if (window.google?.accounts) return listo();
    const etiqueta = document.createElement("script");
    etiqueta.src = "https://accounts.google.com/gsi/client";
    etiqueta.async = true;
    etiqueta.onload = () => listo();
    etiqueta.onerror = () => {
      programa = null;
      fallo(new Error("No se pudo cargar Google."));
    };
    document.head.appendChild(etiqueta);
  });
  return programa;
}

// Lo que este celular manda al entrar: su perfil y sus pedidos, para unirlos a la cuenta si no son de nadie.
function loDeEsteCelular() {
  return {
    prestadorId: leerPrestadorId() ?? undefined,
    pedidos: leerMisPedidos().map((p) => ({ id: p.id, clave: p.clave })),
  };
}

// Al entrar, este celular pasa a mostrar lo de esa cuenta: su perfil (o ninguno) y sus pedidos.
// Con `alEntrar` la pantalla sigue donde estaba (por ejemplo, a mitad de un pedido); si no, se recarga.
export function abrirCuenta(entrada: Entrada, alEntrar?: (cuenta: CuentaGuardada) => void) {
  const cuenta = { nombre: entrada.nombre, clave: entrada.clave, ...(entrada.demo ? { demo: true } : {}) };
  guardarCuenta(cuenta);
  if (entrada.prestadorId) guardarPrestadorId(entrada.prestadorId);
  else borrarPrestadorId();
  recordarPrestador(null);
  // Los pedidos de este celular que no eran de nadie ya quedaron unidos a la cuenta y vuelven en la lista.
  reemplazarMisPedidos(entrada.pedidos);
  if (alEntrar) {
    alEntrar(cuenta);
    return;
  }
  // Se vuelve a cargar: todas las pantallas leen de nuevo quién es el que está usando el celular.
  window.location.reload();
}

// Al salir, el celular queda limpio para que entre otra cuenta. Lo de la cuenta sigue guardado: vuelve al entrar.
function cerrarCuenta() {
  guardarCuenta(null);
  borrarPrestadorId();
  recordarPrestador(null);
  reemplazarMisPedidos([]);
  window.location.assign("/");
}

// Cuenta opcional, con mail y contraseña (se crea en el momento, sin código) o con Google.
// Sirve para no perder el perfil ni los pedidos al cambiar de celular, y para pasar rápido de una cuenta a otra.
export function EntrarACuenta({
  motivo,
  alEntrar,
  abiertoAlInicio = false,
  titulo = "Entrar o crear cuenta",
}: {
  motivo: string;
  alEntrar?: (cuenta: CuentaGuardada) => void;
  abiertoAlInicio?: boolean;
  titulo?: string;
}) {
  const [cuenta, setCuenta] = useState<CuentaGuardada | null>(null);
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  const [eliminando, setEliminando] = useState(false);
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");
  const [hayGoogle, setHayGoogle] = useState(false);
  // Adentro de la app de Android: el identificador web de Google para el inicio de sesión nativo.
  const [googleNativo, setGoogleNativo] = useState<string | null>(null);
  // Recuperar la contraseña por mail: si el servidor lo tiene, y el aviso de que se mandó el enlace.
  const [hayRecuperar, setHayRecuperar] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [recuperacionEnviada, setRecuperacionEnviada] = useState(false);
  const destino = useRef<HTMLDivElement>(null);
  // El aviso de "ya entré" se guarda en una referencia: el botón de Google lo llama desde afuera de React.
  const alEntradaRef = useRef<typeof alEntrar>(undefined);
  alEntradaRef.current = alEntrar
    ? (nueva) => {
        setCuenta(nueva);
        setEntrando(false);
        alEntrar(nueva);
      }
    : undefined;

  useEffect(() => {
    setCuenta(leerCuenta());
  }, []);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void pedirConfigDeCuenta().then((c) => {
      if (vigente) setHayRecuperar(c.recuperar);
    });
    return () => {
      vigente = false;
    };
  }, [abierto]);

  // El botón de Google se dibuja cuando se abre el formulario, si el servidor lo tiene configurado.
  useEffect(() => {
    if (!abierto || cuenta) return;
    let vigente = true;

    async function conGoogle(respuesta: RespuestaDeGoogle) {
      if (!respuesta.credential) return;
      setError("");
      setEntrando(true);
      try {
        abrirCuenta(await pedir<Entrada>("/api/cuenta", { method: "POST", body: JSON.stringify({ credencial: respuesta.credential, ...loDeEsteCelular() }) }), alEntradaRef.current);
      } catch (e) {
        if (vigente) {
          setError(e instanceof Error ? e.message : "No pudimos entrar con Google. Probá de nuevo.");
          setEntrando(false);
        }
      }
    }

    // Dentro de la app de Android, Google no deja entrar desde una página web (WebView): se usa el inicio de
    // sesión nativo si esta versión de la app lo trae; si no, queda mail y contraseña.
    if (esAppNativa()) {
      if (googleNativoDisponible()) {
        void pedirIdDeLaApp().then((id) => {
          if (vigente && id) setGoogleNativo(id);
        });
      }
      return () => {
        vigente = false;
      };
    }
    pedirIdDeLaApp().then(async (id) => {
      if (!id || !vigente) return;
      try {
        await cargarPrograma();
      } catch {
        return;
      }
      if (!vigente || !window.google || !destino.current) return;
      setHayGoogle(true);
      window.google.accounts.id.initialize({ client_id: id, callback: conGoogle, ux_mode: "popup", use_fedcm_for_button: true });
      window.google.accounts.id.renderButton(destino.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "center",
        locale: "es-419",
        width: Math.min(360, destino.current.offsetWidth || 320),
      });
    });

    return () => {
      vigente = false;
    };
  }, [abierto, cuenta]);

  async function conGoogleNativo() {
    if (!googleNativo) return;
    setError("");
    setEntrando(true);
    try {
      const credencial = await entrarConGoogleNativo(googleNativo);
      if (!credencial) return setEntrando(false);
      abrirCuenta(await pedir<Entrada>("/api/cuenta", { method: "POST", body: JSON.stringify({ credencial, ...loDeEsteCelular() }) }), alEntradaRef.current);
    } catch (e) {
      setError(e instanceof ErrorDePedido ? e.message : "No pudimos entrar con Google. Probá de nuevo o entrá con tu mail.");
      setEntrando(false);
    }
  }

  async function recuperarContrasena() {
    setError("");
    if (!email.includes("@")) return setError("Escribí arriba el mail de tu cuenta y tocá de nuevo.");
    setRecuperando(true);
    try {
      await pedir("/api/cuenta/recuperar", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setRecuperacionEnviada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el mail. Probá de nuevo.");
    } finally {
      setRecuperando(false);
    }
  }

  async function conMail() {
    setError("");
    if (!email.includes("@")) return setError("Escribí tu mail.");
    if (contrasena.length < 6) return setError("La contraseña tiene que tener al menos 6 caracteres.");
    setEntrando(true);
    try {
      abrirCuenta(await pedir<Entrada>("/api/cuenta", { method: "POST", body: JSON.stringify({ email: email.trim(), contrasena, ...loDeEsteCelular() }) }), alEntradaRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos entrar. Probá de nuevo.");
      setEntrando(false);
    }
  }

  // "Mi cuenta": quién está, cambiar de cuenta y eliminarla (como pide Google Play), con los enlaces legales al pie.
  if (cuenta) {
    return (
      <section aria-label="Mi cuenta" className="mt-8 border-t border-line pt-4">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <p className="min-w-0 text-[15px] text-ink-500">
            Mi cuenta: <span className="font-semibold text-ink">{cuenta.nombre}</span>
          </p>
          <button type="button" onClick={cerrarCuenta} className="flex min-h-12 shrink-0 items-center text-[15px] font-semibold text-brand">
            Cambiar de cuenta
          </button>
        </div>
        <button type="button" onClick={() => setEliminando(true)} className="flex min-h-12 items-center text-[15px] font-semibold text-danger">
          Eliminar mi cuenta
        </button>
        <p className="mt-2 flex flex-wrap gap-x-4 text-[13px] text-ink-500">
          <Link href="/privacidad" className="flex min-h-12 items-center underline underline-offset-2">
            Privacidad
          </Link>
          <Link href="/terminos" className="flex min-h-12 items-center underline underline-offset-2">
            Términos
          </Link>
          <Link href="/eliminar-cuenta" className="flex min-h-12 items-center underline underline-offset-2">
            Cómo eliminar tu cuenta
          </Link>
        </p>
        {eliminando && <PantallaEliminarCuenta alCerrar={() => setEliminando(false)} />}
      </section>
    );
  }

  if (!abierto) {
    return (
      <div className="mt-8 text-center">
        <button type="button" onClick={() => setAbierto(true)} className="inline-flex min-h-12 items-center text-base font-semibold text-brand">
          Entrar o crear cuenta
        </button>
        <p className="text-[15px] text-ink-500">{motivo}</p>
      </div>
    );
  }

  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        void conMail();
      }}
    >
      <p className="text-lg font-bold text-ink">{titulo}</p>
      <p className="mt-1 text-[15px] text-ink-500">{abiertoAlInicio ? `${motivo} ` : ""}Si el mail es nuevo, la cuenta se crea en el momento. No hay que confirmar nada.</p>
      <Campo etiqueta="Tu mail">
        <input className={claseCampo} value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" maxLength={120} />
      </Campo>
      <Campo etiqueta="Contraseña" ayuda="6 caracteres o más.">
        <input className={claseCampo} value={contrasena} onChange={(e) => setContrasena(e.target.value)} type="password" autoComplete="current-password" maxLength={100} />
      </Campo>
      {hayRecuperar &&
        (recuperacionEnviada ? (
          <p role="status" className="mt-2 text-[15px] text-ink-500">
            Si hay una cuenta con ese mail, te mandamos un enlace para elegir otra contraseña. Vence en 30 minutos. Mirá también en spam.
          </p>
        ) : (
          <button type="button" onClick={() => void recuperarContrasena()} disabled={recuperando} className="mt-1 flex min-h-12 items-center text-[15px] font-semibold text-brand">
            {recuperando ? "Mandando…" : "¿Olvidaste tu contraseña?"}
          </button>
        ))}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-4">
        <BotonSecundario onClick={() => void conMail()} disabled={entrando}>
          {entrando ? "Entrando" : "Entrar"}
        </BotonSecundario>
      </div>
      {googleNativo && (
        <button
          type="button"
          onClick={() => void conGoogleNativo()}
          disabled={entrando}
          className="boton-google mt-4 flex min-h-12 w-full items-center justify-center gap-3 rounded-full border px-4 text-[15px] font-medium disabled:opacity-60"
        >
          <LogoDeGoogle />
          Continuar con Google
        </button>
      )}
      <div className={hayGoogle ? "mt-4" : "hidden"}>
        {/* El botón lo dibuja Google: así lo exigen sus reglas de marca. */}
        <div ref={destino} className="flex min-h-11 w-full justify-center" />
      </div>
      <p className="mt-4 text-center text-[13px] text-ink-500">
        Al entrar aceptás los{" "}
        <Link href="/terminos" className="font-semibold text-brand">
          términos
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" className="font-semibold text-brand">
          privacidad
        </Link>
        .
      </p>
    </form>
  );
}

// La "G" de Google, como pide su guía de marca para los botones propios.
function LogoDeGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
