import { variable } from "@/lib/config";

// Avisos a la app de Android por Firebase Cloud Messaging (API HTTP v1).
// Hace falta FCM_SERVICE_ACCOUNT: el JSON de una cuenta de servicio del proyecto de Firebase (secreto del Worker).
// Sin eso, los avisos nativos quedan apagados y la app no ofrece activarlos.

interface CuentaDeServicio {
  project_id: string;
  client_email: string;
  private_key: string;
}

function cuentaDeServicio(): CuentaDeServicio | null {
  const crudo = variable("FCM_SERVICE_ACCOUNT");
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as Partial<CuentaDeServicio>;
    return datos.project_id && datos.client_email && datos.private_key ? (datos as CuentaDeServicio) : null;
  } catch {
    return null;
  }
}

export function fcmDisponible() {
  return cuentaDeServicio() !== null;
}

// Identificadores de Firebase: letras, números y algunos signos. Se guardan con el prefijo "fcm:".
export function tokenValido(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_:\-.]{20,4096}$/.test(token);
}

function b64url(bytes: Uint8Array | string) {
  const datos = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let texto = "";
  for (const b of datos) texto += String.fromCharCode(b);
  return btoa(texto).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
}

let acceso: { token: string; vence: number } | null = null;

// Permiso de Google para mandar avisos: un JWT firmado con la llave de la cuenta de servicio, cambiado por un token.
async function tokenDeAcceso(cuenta: CuentaDeServicio) {
  if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
  const pem = cuenta.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: cuenta.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 }),
  )}`;
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(cuerpo)));
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cuerpo}.${b64url(firma)}` }),
  });
  const datos = (await respuesta.json()) as { access_token?: string; expires_in?: number };
  if (!respuesta.ok || !datos.access_token) throw new Error("Firebase no dio permiso para mandar avisos.");
  acceso = { token: datos.access_token, vence: Date.now() + (datos.expires_in ?? 3600) * 1000 };
  return acceso.token;
}

// Manda el aviso a un celular. "vencida" = Firebase dice que ese identificador ya no existe (hay que borrarlo).
export async function enviarFcm(token: string, aviso: { titulo: string; texto: string; url: string; tipo: string }): Promise<"ok" | "vencida" | "error"> {
  const cuenta = cuentaDeServicio();
  if (!cuenta) return "error";
  try {
    const respuesta = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cuenta.project_id)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await tokenDeAcceso(cuenta)}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: aviso.titulo, body: aviso.texto },
          data: { url: aviso.url, tipo: aviso.tipo },
          android: { priority: "high", notification: { tag: aviso.tipo, color: "#FF5A1F" } },
        },
      }),
    });
    if (respuesta.ok) return "ok";
    const error = await respuesta.text();
    if (respuesta.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(error)) return "vencida";
    console.error("[fcm]", respuesta.status, error.slice(0, 200));
    return "error";
  } catch (error) {
    console.error("[fcm]", error instanceof Error ? error.message : "error");
    return "error";
  }
}
