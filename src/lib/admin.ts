import { secretoDeAdministracion } from "./config";
import { dentroDelCupo } from "./db";

// Puerta del panel interno: el secreto de administración viaja en el encabezado `x-admin`.
// Sin ADMIN_SECRET configurado el panel no existe (503). Los intentos fallidos tienen un tope diario.

export type ResultadoDeAdmin = { ok: true } | { ok: false; respuesta: Response };

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i += 1) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}

export async function comprobarAdmin(request: Request): Promise<ResultadoDeAdmin> {
  const secreto = secretoDeAdministracion();
  if (!secreto) return { ok: false, respuesta: Response.json({ error: "El panel no está configurado." }, { status: 503 }) };
  const enviado = request.headers.get("x-admin") ?? "";
  if (enviado && iguales(enviado, secreto)) return { ok: true };
  // Cada intento fallido gasta del cupo del día: con demasiados, el panel se cierra hasta mañana.
  const quedan = await dentroDelCupo("adminFallos");
  return { ok: false, respuesta: Response.json({ error: quedan ? "Clave incorrecta." : "Demasiados intentos. Probá mañana." }, { status: quedan ? 401 : 429 }) };
}
