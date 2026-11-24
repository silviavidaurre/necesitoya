import { idDeGoogle } from "@/lib/config";
import { dentroDelCupo, leer, modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";
import type { BaseDeDatos, Cuenta } from "@/lib/tipos";

// La cuenta es opcional: la app se usa sin ella. Sirve para que el perfil del prestador y los pedidos del vecino
// no queden atados a un celular, y para pasar rápido de una cuenta a otra en el mismo celular.
// Se entra de dos formas: con mail y contraseña (sin código de verificación: se crea en el momento) o con Google.
// Al entrar, lo que este celular ya tiene y no es de nadie se une a la cuenta, y lo de la cuenta vuelve al celular.

// Le dice a la app si hay Google configurado, y con qué identificador público.
export async function GET() {
  return Response.json({ google: idDeGoogle() ?? null });
}

class ErrorDeCuenta extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// --- Google ------------------------------------------------------------------------------------

// Google confirma que el comprobante es suyo, está vigente y fue emitido para esta app.
async function verificarGoogle(credencial: string, idDeLaApp: string): Promise<{ sub: string; nombre: string } | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 10_000);
  try {
    const respuesta = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credencial)}`, { signal: control.signal });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Record<string, unknown>;
    const emisor = String(datos.iss ?? "");
    if (datos.aud !== idDeLaApp) return null;
    if (emisor !== "accounts.google.com" && emisor !== "https://accounts.google.com") return null;
    if (Number(datos.exp) * 1000 < Date.now()) return null;
    const sub = typeof datos.sub === "string" ? datos.sub : "";
    if (!sub) return null;
    const nombre = limpiarTexto(datos.given_name ?? datos.name ?? "", 40) || "Vecino";
    return { sub, nombre };
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// --- Mail y contraseña -------------------------------------------------------------------------

const MAIL_VALIDO = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const INTENTOS = 5;
const ESPERA_MIN = 5;

// La contraseña nunca se guarda: se guarda una huella que no se puede dar vuelta (PBKDF2 con sal propia de la cuenta).
async function huella(contrasena: string, sal: string) {
  const texto = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", texto.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: texto.encode(sal), iterations: 100_000 }, material, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i += 1) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}

// --- Lo que comparten las dos formas de entrar ---------------------------------------------------

interface DelCelular {
  prestadorId: string;
  pedidos: { id: string; clave: string }[];
}

function delCelular(cuerpo: Record<string, unknown>): DelCelular {
  return {
    prestadorId: typeof cuerpo.prestadorId === "string" ? cuerpo.prestadorId : "",
    pedidos: Array.isArray(cuerpo.pedidos)
      ? cuerpo.pedidos
          .filter((p: unknown): p is { id: string; clave: string } => {
            const pedido = p as { id?: unknown; clave?: unknown } | null;
            return typeof pedido?.id === "string" && typeof pedido?.clave === "string";
          })
          .slice(0, 30)
      : [],
  };
}

// Une a la cuenta lo que el celular tiene sin dueño y devuelve todo lo que es de la cuenta.
function entrar(db: BaseDeDatos, cuenta: Cuenta, celular: DelCelular, nueva: boolean) {
  // Perfil: una cuenta, un perfil. Si la cuenta todavía no tiene y este celular sí (y no es de otra cuenta), se une.
  let prestador = db.prestadores.find((p) => p.cuenta === cuenta.sub);
  if (!prestador && celular.prestadorId) {
    const suelto = db.prestadores.find((p) => p.id === celular.prestadorId && !p.ejemplo && !p.cuenta);
    if (suelto) {
      suelto.cuenta = cuenta.sub;
      prestador = suelto;
    }
  }

  // Pedidos: los de este celular (probando que son suyos con la clave) y sin dueño quedan unidos a la cuenta.
  for (const { id, clave } of celular.pedidos) {
    const pedido = db.pedidos.find((p) => p.id === id);
    if (pedido && pedido.claveCliente && pedido.claveCliente === clave && !pedido.cuenta) pedido.cuenta = cuenta.sub;
  }

  return {
    nombre: cuenta.nombre,
    clave: cuenta.clave,
    nueva,
    // El id secreto del perfil solo viaja a su dueño, recién confirmado.
    prestadorId: prestador?.id ?? null,
    pedidos: db.pedidos
      .filter((p) => p.cuenta === cuenta.sub && p.claveCliente)
      .sort((a, b) => b.creado.localeCompare(a.creado))
      .slice(0, 30)
      .map((p) => ({ id: p.id, clave: p.claveCliente as string, titulo: p.titulo, creado: p.creado })),
  };
}

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo || typeof cuerpo !== "object") return Response.json({ error: "Datos inválidos." }, { status: 400 });
  const celular = delCelular(cuerpo);

  // Con Google.
  if (typeof cuerpo.credencial === "string") {
    const idDeLaApp = idDeGoogle();
    if (!idDeLaApp) return Response.json({ error: "Entrar con Google no está disponible." }, { status: 503 });
    const credencial = cuerpo.credencial;
    if (credencial.length < 100 || credencial.length > 4000) return Response.json({ error: "No pudimos entrar con Google. Probá de nuevo." }, { status: 400 });
    const google = await verificarGoogle(credencial, idDeLaApp);
    if (!google) return Response.json({ error: "No pudimos confirmar tu cuenta de Google. Probá de nuevo." }, { status: 401 });

    const resultado = await modificar((db) => {
      db.cuentas ??= [];
      let cuenta = db.cuentas.find((c) => c.sub === google.sub);
      const nueva = !cuenta;
      if (!cuenta) {
        cuenta = { sub: google.sub, nombre: google.nombre, clave: nuevoId(), creado: new Date().toISOString() };
        db.cuentas.push(cuenta);
      }
      return entrar(db, cuenta, celular, nueva);
    });
    return Response.json(resultado);
  }

  // Con mail y contraseña. Si la cuenta no existe, se crea en el momento.
  const email = limpiarTexto(cuerpo.email, 120).toLowerCase();
  const contrasena = typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
  if (!MAIL_VALIDO.test(email)) return Response.json({ error: "Escribí un mail válido, por ejemplo nombre@gmail.com." }, { status: 400 });
  if (contrasena.length < 6 || contrasena.length > 100) return Response.json({ error: "La contraseña tiene que tener al menos 6 caracteres." }, { status: 400 });
  if (!(await dentroDelCupo("cuentas"))) return Response.json({ error: "Hoy hubo demasiados ingresos. Probá de nuevo mañana." }, { status: 429 });

  const sub = `mail:${email}`;
  const existente = (await leer()).cuentas?.find((c) => c.sub === sub);
  if (existente?.bloqueadaHasta && existente.bloqueadaHasta > new Date().toISOString()) {
    return Response.json({ error: `Demasiados intentos. Probá de nuevo en ${ESPERA_MIN} minutos.` }, { status: 429 });
  }

  // La huella se calcula afuera del cambio de datos, porque tarda.
  const sal = existente?.sal ?? nuevoId();
  const calculada = await huella(contrasena, sal);

  try {
    const resultado = await modificar((db) => {
      db.cuentas ??= [];
      let cuenta = db.cuentas.find((c) => c.sub === sub);
      const nueva = !cuenta;
      if (cuenta) {
        // Si la cuenta cambió entre la lectura y este momento (otra sal), se pide reintentar.
        if (cuenta.sal !== sal || !cuenta.hash) throw new ErrorDeCuenta("No pudimos entrar. Probá de nuevo.", 409);
        if (!iguales(cuenta.hash, calculada)) {
          cuenta.fallos = (cuenta.fallos ?? 0) + 1;
          if (cuenta.fallos >= INTENTOS) {
            cuenta.fallos = 0;
            cuenta.bloqueadaHasta = new Date(Date.now() + ESPERA_MIN * 60_000).toISOString();
          }
          // Se devuelve en vez de lanzar: si se lanzara, el conteo de intentos no quedaría guardado.
          return null;
        }
        cuenta.fallos = 0;
        cuenta.bloqueadaHasta = undefined;
      } else {
        cuenta = { sub, nombre: email.split("@")[0].slice(0, 40), clave: nuevoId(), creado: new Date().toISOString(), email, sal, hash: calculada };
        db.cuentas.push(cuenta);
      }
      return entrar(db, cuenta, celular, nueva);
    });
    if (!resultado) return Response.json({ error: "Ese mail ya tiene cuenta y la contraseña no coincide." }, { status: 401 });
    return Response.json(resultado);
  } catch (error) {
    if (error instanceof ErrorDeCuenta) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
