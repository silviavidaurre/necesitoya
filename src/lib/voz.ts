import { ZONAS } from "./catalogo";
import { claveDeVoz } from "./config";

// Voz de NecesitoYa con ElevenLabs: pasar a texto lo que la persona grabó y leer en voz alta lo que la app responde.
// Se llama a la API REST con fetch, sin el SDK, para que el mismo código corra en Cloudflare Workers.

const API = "https://api.elevenlabs.io";

// Voz "Gabriel Founder KILO": clon de la voz de Gabriel, de Jujuy, con su voseo del norte. Está en la misma cuenta de
// ElevenLabs que la clave de la app (la cuenta del hackathon). Antes se usaba "Janet Tucumán" (r3lotmx3BZETVvcKm6R6).
export const VOZ_ID = "qxrTmwapaXTTqUfspgrW";

// Modelo estable y multilingüe, el que Gabriel eligió para su voz. Con frases cortas responde en alrededor de un
// segundo, igual que el modelo rápido (medido el 24/11/2026), y suena más natural.
const MODELO_PARA_DECIR = "eleven_multilingual_v2";
// Ajustes elegidos para su voz: con más estilo o menos estabilidad a veces cambiaba el voseo por el «tú».
const AJUSTES_DE_VOZ = { stability: 0.5, similarity_boost: 0.9, style: 0.2, use_speaker_boost: true };
// MP3 liviano: una frase de 20 segundos pesa unos 160 KB, pensado para datos móviles.
const FORMATO_DE_AUDIO = "mp3_44100_64";
// Reconocimiento de voz para audio grabado (Scribe).
const MODELO_PARA_TRANSCRIBIR = "scribe_v3";

export const MAXIMO_TEXTO = 600;
// La transcripción se cobra por duración, así que el tope sigue al minuto que deja grabar la app:
// a los 48 kbps que pide el navegador, un minuto ocupa unos 360 KB (480.000 caracteres en base64).
// Se deja el doble de margen porque algunos navegadores graban con más calidad que la pedida.
export const MAXIMO_AUDIO_BASE64 = 1_000_000;
const ESPERA_MS = 25_000;

// Lo que graban los navegadores (webm en Chrome y Firefox, mp4 en iPhone) más ogg, wav y mp3.
const TIPOS_DE_AUDIO: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
};

// Error con el mensaje que ve la persona y el código HTTP que devuelve la ruta.
export class ErrorDeVoz extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

export function vozDisponible() {
  return Boolean(claveDeVoz());
}

export interface AudioGrabado {
  tipo: string;
  base64: string;
}

// Valida el audio que llega del navegador. Lanza un ErrorDeVoz si no sirve.
export function audioValido(valor: unknown): AudioGrabado {
  const { tipo, base64 } = (valor && typeof valor === "object" ? valor : {}) as { tipo?: unknown; base64?: unknown };
  // El navegador agrega el códec ("audio/webm;codecs=opus"): se compara solo la primera parte.
  const tipoBase = typeof tipo === "string" ? tipo.split(";")[0].trim().toLowerCase() : "";
  if (!Object.hasOwn(TIPOS_DE_AUDIO, tipoBase)) {
    throw new ErrorDeVoz("No pudimos usar ese audio. Probá grabar de nuevo o escribilo.", 400);
  }
  if (typeof base64 !== "string" || base64.length < 200 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new ErrorDeVoz("No llegamos a escucharte. Probá grabar de nuevo o escribilo.", 400);
  }
  if (base64.length > MAXIMO_AUDIO_BASE64) {
    throw new ErrorDeVoz("El audio es muy largo. Contalo en menos de un minuto.", 413);
  }
  return { tipo: tipoBase, base64 };
}

// Qué puede hacer la persona si la voz no anda, según lo que estaba haciendo.
const SI_NO_ESCUCHA = "Escribilo.";
const SI_NO_HABLA = "Leelo en pantalla.";

function claveObligatoria(salida: string): string {
  const clave = claveDeVoz();
  if (!clave) throw new ErrorDeVoz(`La voz todavía no está configurada. ${salida}`, 503);
  return clave;
}

// Hace el pedido a ElevenLabs y traduce las fallas a un mensaje que la persona pueda entender.
async function llamar(ruta: string, opciones: RequestInit, alFallar: string, salida: string): Promise<Response> {
  let respuesta: Response;
  try {
    respuesta = await fetch(API + ruta, { ...opciones, signal: AbortSignal.timeout(ESPERA_MS) });
  } catch (error) {
    console.error("[voz] sin respuesta de ElevenLabs:", (error as Error).name);
    throw new ErrorDeVoz(alFallar, 504);
  }
  if (respuesta.ok) return respuesta;

  const cuerpo = (await respuesta.json().catch(() => null)) as { detail?: { status?: string; code?: string } } | null;
  const motivo = cuerpo?.detail?.status ?? cuerpo?.detail?.code ?? "";
  // Al registro va solo el código y el motivo, nunca la clave ni el contenido.
  console.error("[voz] ElevenLabs respondió", respuesta.status, motivo);

  if (motivo === "quota_exceeded" || respuesta.status === 402) {
    throw new ErrorDeVoz(`La voz se quedó sin saldo por ahora. ${salida}`, 503);
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    throw new ErrorDeVoz(`La voz no está disponible ahora. ${salida}`, 503);
  }
  if (respuesta.status === 429) {
    throw new ErrorDeVoz("Hay muchos pedidos de voz a la vez. Esperá unos segundos y probá de nuevo.", 429);
  }
  throw new ErrorDeVoz(alFallar, 502);
}

// Pasa a texto un audio corto en español. Devuelve "" si no se entendió nada.
export async function transcribir(audio: AudioGrabado): Promise<string> {
  const clave = claveObligatoria(SI_NO_ESCUCHA);

  const binario = atob(audio.base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  const formulario = new FormData();
  formulario.append("model_id", MODELO_PARA_TRANSCRIBIR);
  formulario.append("language_code", "es");
  // Solo interesa lo que dijo: sin "(risas)" ni "(ruido)", y sin muletillas ni frases cortadas.
  formulario.append("tag_audio_events", "false");
  formulario.append("no_verbatim", "true");
  // Los nombres de los barrios son lo que más le cuesta a un reconocimiento de voz general.
  for (const zona of ZONAS) formulario.append("keyterms", zona);
  formulario.append("file", new Blob([bytes], { type: audio.tipo }), `audio.${TIPOS_DE_AUDIO[audio.tipo]}`);

  const respuesta = await llamar(
    "/v1/speech-to-text",
    { method: "POST", headers: { "xi-api-key": clave }, body: formulario },
    "No pudimos pasar tu audio a texto. Probá de nuevo o escribilo.",
    SI_NO_ESCUCHA,
  );
  const datos = (await respuesta.json().catch(() => null)) as { text?: unknown } | null;
  return typeof datos?.text === "string" ? datos.text.replace(/\s+/g, " ").trim() : "";
}

// Lee un texto corto con la voz elegida. Devuelve el MP3.
export async function decir(texto: string): Promise<ArrayBuffer> {
  const clave = claveObligatoria(SI_NO_HABLA);
  const respuesta = await llamar(
    `/v1/text-to-speech/${VOZ_ID}?output_format=${FORMATO_DE_AUDIO}`,
    {
      method: "POST",
      headers: { "xi-api-key": clave, "content-type": "application/json" },
      // language_code fija el español: así los números y las abreviaturas no se leen en otro idioma.
      body: JSON.stringify({ text: texto, model_id: MODELO_PARA_DECIR, language_code: "es", voice_settings: AJUSTES_DE_VOZ }),
    },
    "No pudimos leerlo en voz alta. Probá de nuevo o leelo en pantalla.",
    SI_NO_HABLA,
  );
  const audio = await respuesta.arrayBuffer();
  if (audio.byteLength === 0) throw new ErrorDeVoz("No pudimos leerlo en voz alta. Probá de nuevo o leelo en pantalla.", 502);
  return audio;
}
