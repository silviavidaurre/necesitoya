import { cuentaDe, leer, modificar } from "@/lib/db";
import { fcmDisponible, tokenValido } from "@/lib/fcm";
import { clavePublicaVapid, endpointValido, pushDisponible } from "@/lib/push";

const CELULARES_POR_CUENTA = 5;

// Le dice a la app si hay avisos y con qué clave pública suscribirse (la clave pública no es secreta).
export async function GET() {
  // `fcm`: si se pueden mandar avisos a la app de Android (Firebase).
  return Response.json({ disponible: pushDisponible(), publica: pushDisponible() ? clavePublicaVapid() : null, fcm: fcmDisponible() });
}

// Anota (o quita, con `quitar`) un celular para recibir avisos de su cuenta.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const nativo = cuerpo?.fcm !== undefined;
  if (nativo ? !fcmDisponible() : !pushDisponible()) return Response.json({ error: "Los avisos no están disponibles." }, { status: 503 });

  if (typeof cuerpo?.quitar === "string") {
    const quitar = cuerpo.quitar;
    await modificar((db) => {
      db.suscripciones = (db.suscripciones ?? []).filter((s) => s.endpoint !== quitar);
    });
    return Response.json({ listo: true });
  }

  // Un celular con la app de Android se anota con su identificador de Firebase, con el prefijo "fcm:".
  if (nativo && !tokenValido(cuerpo.fcm)) return Response.json({ error: "No pudimos activar los avisos en este celular." }, { status: 400 });
  const endpoint = nativo ? `fcm:${cuerpo.fcm}` : cuerpo?.suscripcion?.endpoint;
  if (!nativo && !endpointValido(endpoint)) return Response.json({ error: "No pudimos activar los avisos en este celular." }, { status: 400 });
  const cuenta = cuentaDe(await leer(), cuerpo?.cuenta);
  if (!cuenta) return Response.json({ error: "Entrá con tu cuenta para recibir avisos." }, { status: 401 });

  await modificar((db) => {
    const otros = (db.suscripciones ?? []).filter((s) => s.endpoint !== endpoint);
    const deLaCuenta = otros.filter((s) => s.cuenta === cuenta);
    // Si la cuenta ya tiene muchos celulares anotados, se olvida el más viejo.
    const sobran = new Set(deLaCuenta.slice(0, Math.max(0, deLaCuenta.length - (CELULARES_POR_CUENTA - 1))).map((s) => s.endpoint));
    db.suscripciones = [...otros.filter((s) => !sobran.has(s.endpoint)), { endpoint, cuenta, creado: new Date().toISOString() }];
  });
  return Response.json({ listo: true }, { status: 201 });
}
