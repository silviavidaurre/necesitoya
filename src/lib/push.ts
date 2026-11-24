import { variable } from "./config";

// Avisos web push con VAPID. Se mandan SIN contenido: el aviso solo despierta al service worker del celular,
// que pide el texto a /api/avisos/ultimo. Así no hace falta cifrar nada y el texto nunca pasa por el servicio de push.

function b64url(bytes: Uint8Array) {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
}

function desdeB64url(texto: string) {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

export function clavePublicaVapid() {
  return variable("VAPID_PUBLIC_KEY");
}

export function pushDisponible() {
  return Boolean(clavePublicaVapid() && variable("VAPID_PRIVATE_KEY"));
}

let llave: { privada: string; publica: string; clave: CryptoKey } | null = null;

async function llavePrivada() {
  const publica = clavePublicaVapid();
  const privada = variable("VAPID_PRIVATE_KEY");
  if (!publica || !privada) return null;
  if (llave && llave.privada === privada && llave.publica === publica) return llave.clave;
  const crudo = desdeB64url(publica);
  const clave = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64url(crudo.slice(1, 33)), y: b64url(crudo.slice(33, 65)), d: privada, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  llave = { privada, publica, clave };
  return clave;
}

// Firma el permiso VAPID (un JWT ES256) para el servicio de push de ese celular.
async function permiso(endpoint: string) {
  const clave = await llavePrivada();
  if (!clave) return null;
  const texto = new TextEncoder();
  const cabecera = b64url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = b64url(
    texto.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: variable("VAPID_SUBJECT") ?? "https://necesitoya.gabriel13iturre.workers.dev",
      }),
    ),
  );
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, texto.encode(`${cabecera}.${cuerpo}`)));
  return `vapid t=${cabecera}.${cuerpo}.${b64url(firma)}, k=${clavePublicaVapid()}`;
}

// Despierta al celular. Devuelve "vencida" si el servicio dice que esa suscripción ya no existe (hay que borrarla).
export async function despertar(endpoint: string): Promise<"ok" | "vencida" | "error"> {
  try {
    const autorizacion = await permiso(endpoint);
    if (!autorizacion) return "error";
    const respuesta = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: autorizacion, ttl: "86400", urgency: "high", "content-length": "0" },
    });
    if (respuesta.status === 404 || respuesta.status === 410) return "vencida";
    return respuesta.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

// Solo se aceptan servicios de push conocidos: evita que alguien use al servidor para pegarle a otra dirección.
export function endpointValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 800) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return /(^|[.])(googleapis[.]com|mozilla[.]com|mozaws[.]net|windows[.]com|notify[.]windows[.]com|push[.]apple[.]com)$/.test(url.hostname);
  } catch {
    return false;
  }
}
