// Claves de la IA y de la voz. En Cloudflare las entrega el Worker en cada pedido; en desarrollo salen de .env.local.

let claveIa: string | undefined;

export function configurarIa(clave: string | undefined) {
  claveIa = clave || undefined;
}

export function claveDeIa(): string | undefined {
  if (claveIa) return claveIa;
  return typeof process !== "undefined" ? process.env?.ANTHROPIC_API_KEY || undefined : undefined;
}

// Identificador público de la app en Google, para "Continuar con Google". No es secreto: viaja al navegador.
let google: string | undefined;

export function configurarGoogle(id: string | undefined) {
  google = id || undefined;
}

export function idDeGoogle(): string | undefined {
  if (google) return google;
  return typeof process !== "undefined" ? process.env?.GOOGLE_CLIENT_ID || undefined : undefined;
}

// Clave de la voz (ElevenLabs): mismo camino que la de la IA.
let claveVoz: string | undefined;

export function configurarVoz(clave: string | undefined) {
  claveVoz = clave || undefined;
}

export function claveDeVoz(): string | undefined {
  if (claveVoz) return claveVoz;
  return typeof process !== "undefined" ? process.env?.ELEVENLABS_API_KEY || undefined : undefined;
}
