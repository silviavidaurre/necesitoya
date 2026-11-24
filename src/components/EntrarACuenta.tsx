import { useEffect, useRef, useState } from "react";
import { recordarPrestador } from "@/components/usePrestador";
import { Link } from "@/lib/navegacion";
import { BotonSecundario, Campo, claseCampo } from "@/components/ui";
import {
  borrarPrestadorId,
  guardarCuenta,
  guardarPrestadorId,
  leerCuenta,
  leerMisPedidos,
  leerPrestadorId,
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

interface Entrada {
  nombre: string;
  clave: string;
  nueva: boolean;
  prestadorId: string | null;
  pedidos: PedidoGuardado[];
}

// El identificador de la app en Google se pide una sola vez por visita.
let idDeLaApp: Promise<string | null> | null = null;
function pedirIdDeLaApp() {
  idDeLaApp ??= pedir<{ google: string | null }>("/api/cuenta")
    .then((datos) => datos.google)
    .catch(() => {
      idDeLaApp = null;
      return null;
    });
  return idDeLaApp;
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
function abrirCuenta(entrada: Entrada, alEntrar?: (cuenta: CuentaGuardada) => void) {
  const cuenta = { nombre: entrada.nombre, clave: entrada.clave };
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
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");
  const [hayGoogle, setHayGoogle] = useState(false);
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

  if (cuenta) {
    return (
      <div className="mt-8 flex min-h-12 items-center justify-between gap-3">
        <p className="min-w-0 text-[15px] text-ink-500">
          Tu cuenta: <span className="font-semibold text-ink">{cuenta.nombre}</span>
        </p>
        <button type="button" onClick={cerrarCuenta} className="flex min-h-12 shrink-0 items-center text-[15px] font-semibold text-brand">
          Cambiar de cuenta
        </button>
      </div>
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
