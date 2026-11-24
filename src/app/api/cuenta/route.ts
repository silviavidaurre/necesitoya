import { correoDisponible } from "@/integraciones/resend-correo/correo";
import { idDeGoogle, verificarGoogle } from "@/integraciones/google-cuenta/google";
import { conexionDe, dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { huella, iguales } from "@/lib/contrasenas";
import { limpiarTexto } from "@/lib/texto";
import type { BaseDeDatos, Cuenta } from "@/lib/tipos";

// La cuenta es opcional: la app se usa sin ella. Sirve para que el perfil del prestador y los pedidos del vecino
// no queden atados a un celular, y para pasar rápido de una cuenta a otra en el mismo celular.
// Se entra de dos formas: con mail y contraseña (sin código de verificación: se crea en el momento) o con Google.
// Al entrar, lo que este celular ya tiene y no es de nadie se une a la cuenta, y lo de la cuenta vuelve al celular.

// Le dice a la app si hay Google configurado, y con qué identificador público.
export async function GET() {
  // `recuperar`: si se puede pedir otra contraseña por mail (hace falta el correo configurado).
  return Response.json({ google: idDeGoogle() ?? null, recuperar: correoDisponible() });
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


// --- Mail y contraseña -------------------------------------------------------------------------

const MAIL_VALIDO = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const INTENTOS = 5;
const ESPERA_MIN = 5;

// --- Lo que comparten las dos formas de entrar ---------------------------------------------------

interface DelCelular {
  prestadorId: string;
  pedidos: { id: string; clave: string }[];
}

export function delCelular(cuerpo: Record<string, unknown>): DelCelular {
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
export function entrar(db: BaseDeDatos, cuenta: Cuenta, celular: DelCelular, nueva: boolean) {
  // Perfil: una cuenta, un perfil. Si la cuenta todavía no tiene y este celular sí (y no es de otra cuenta), se une.
  let prestador = db.prestadores.find((p) => p.cuenta === cuenta.sub);
  // Una cuenta de demostración nunca se queda con lo que hay suelto en el celular: eso es real y, unido a la demo,
  // se borraría al recargar el barrio.
  if (!prestador && celular.prestadorId && !cuenta.demo) {
    const suelto = db.prestadores.find((p) => p.id === celular.prestadorId && !p.ejemplo && !p.cuenta);
    if (suelto) {
      suelto.cuenta = cuenta.sub;
      prestador = suelto;
    }
  }

  // Pedidos: los de este celular (probando que son suyos con la clave) y sin dueño quedan unidos a la cuenta.
  for (const { id, clave } of cuenta.demo ? [] : celular.pedidos) {
    const pedido = db.pedidos.find((p) => p.id === id);
    if (pedido && pedido.claveCliente && pedido.claveCliente === clave && !pedido.cuenta) pedido.cuenta = cuenta.sub;
  }

  return {
    nombre: cuenta.nombre,
    clave: cuenta.clave,
    // Cuenta de demostración: la app muestra un cartel de que todo es inventado.
    ...(cuenta.demo ? { demo: true } : {}),
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
  if (!(await dentroDelCupo("cuentas")) || !(await dentroDelCupoDe("cuentasPorConexion", conexionDe(request)))) return Response.json({ error: "Hoy hubo demasiados ingresos. Probá de nuevo mañana." }, { status: 429 });

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
