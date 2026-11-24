import { delCelular, entrar } from "@/app/api/cuenta/route";
import { huella } from "@/lib/contrasenas";
import { correoDisponible, enlaceValido, enviarCorreo, huellaDeEnlace, nuevoEnlace } from "@/lib/correo";
import { conexionDe, dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";

// Elegir otra contraseña con un enlace que llega por mail. Dos pasos con la misma ruta:
//   { email }               manda el enlace (vence en 30 minutos y sirve una sola vez)
//   { token, contrasena }   cambia la contraseña y deja la cuenta abierta en ese celular
// La respuesta al primer paso es siempre la misma, exista o no la cuenta: no sirve para averiguar mails.
const MAIL_VALIDO = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const VENCE_MIN = 30;

class ErrorDeRecuperacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

export async function POST(request: Request) {
  if (!correoDisponible()) return Response.json({ error: "Recuperar la contraseña por mail todavía no está disponible." }, { status: 503 });
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo || typeof cuerpo !== "object") return Response.json({ error: "Datos inválidos." }, { status: 400 });

  // Paso 2: con el enlace, la contraseña nueva.
  if (cuerpo.token !== undefined) {
    const contrasena = typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
    if (!enlaceValido(cuerpo.token)) return Response.json({ error: "El enlace no es válido. Pedí otro." }, { status: 400 });
    if (contrasena.length < 6 || contrasena.length > 100) return Response.json({ error: "La contraseña tiene que tener al menos 6 caracteres." }, { status: 400 });
    const buscada = await huellaDeEnlace(cuerpo.token);
    const ahora = new Date().toISOString();
    const cuenta = (await leer()).cuentas?.find((c) => c.recuperacion?.huella === buscada);
    if (!cuenta?.recuperacion || cuenta.recuperacion.vence < ahora) return Response.json({ error: "El enlace venció o ya se usó. Pedí otro." }, { status: 400 });
    const sal = nuevoId();
    const nueva = await huella(contrasena, sal);
    try {
      const entrada = await modificar((db) => {
        const actual = db.cuentas?.find((c) => c.sub === cuenta.sub);
        if (!actual?.recuperacion || actual.recuperacion.huella !== buscada || actual.recuperacion.vence < ahora) {
          throw new ErrorDeRecuperacion("El enlace venció o ya se usó. Pedí otro.", 400);
        }
        actual.sal = sal;
        actual.hash = nueva;
        actual.fallos = 0;
        actual.bloqueadaHasta = undefined;
        actual.recuperacion = undefined;
        return entrar(db, actual, delCelular(cuerpo), false);
      });
      return Response.json(entrada);
    } catch (error) {
      if (error instanceof ErrorDeRecuperacion) return Response.json({ error: error.message }, { status: error.estado });
      throw error;
    }
  }

  // Paso 1: mandar el enlace.
  const email = limpiarTexto(cuerpo.email, 120).toLowerCase();
  if (!MAIL_VALIDO.test(email)) return Response.json({ error: "Escribí el mail de tu cuenta." }, { status: 400 });
  if (!(await dentroDelCupo("correos")) || !(await dentroDelCupoDe("correosPorConexion", conexionDe(request)))) {
    return Response.json({ error: "Hubo demasiados pedidos. Probá de nuevo más tarde." }, { status: 429 });
  }
  const enviado = { enviado: true, vence: VENCE_MIN };
  const sub = `mail:${email}`;
  if (!(await leer()).cuentas?.some((c) => c.sub === sub && c.hash)) return Response.json(enviado);

  const { token, vence } = nuevoEnlace(VENCE_MIN);
  const guardada = await huellaDeEnlace(token);
  await modificar((db) => {
    const cuenta = db.cuentas?.find((c) => c.sub === sub);
    if (cuenta) cuenta.recuperacion = { huella: guardada, vence };
  });
  const enlace = `${new URL(request.url).origin}/recuperar?t=${token}`;
  await enviarCorreo({
    para: email,
    asunto: "Elegí otra contraseña para NecesitoYa",
    texto: [
      "Hola.",
      "",
      "Alguien pidió elegir otra contraseña para tu cuenta de NecesitoYa. Si fuiste vos, abrí este enlace:",
      enlace,
      "",
      `Sirve una sola vez y vence en ${VENCE_MIN} minutos. Si no lo pediste, ignorá este mail: tu contraseña sigue igual.`,
      "",
      "NecesitoYa",
    ].join("\n"),
  });
  return Response.json(enviado);
}
