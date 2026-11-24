// Grabación corta con el micrófono del navegador (MediaRecorder).
// Es el camino de respaldo del dictado: funciona en iPhone y Firefox, que no traen reconocimiento de voz propio.

export const MAXIMO_SEGUNDOS = 60;
// Una grabación más corta que esto es un toque por error: no vale la pena mandarla a transcribir.
const MINIMO_MS = 600;

// Formatos en orden de preferencia: webm/opus en Chrome y Firefox, mp4 en Safari.
const FORMATOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export interface AudioListo {
  tipo: string;
  base64: string;
}

export interface Grabacion {
  // Corta y devuelve el audio, o null si no se llegó a grabar nada útil.
  parar(): Promise<AudioListo | null>;
  // Corta y tira lo grabado (la persona salió de la pantalla).
  descartar(): void;
}

export function puedeGrabar() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function enBase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(",")[1] ?? "");
    lector.onerror = () => rechazar(new Error("No pudimos leer la grabación. Probá de nuevo o escribilo."));
    lector.readAsDataURL(blob);
  });
}

// Pide el micrófono y empieza a grabar. Al llegar al límite de tiempo avisa para que quien la usa la cierre.
export async function grabar(alLlegarAlLimite: () => void): Promise<Grabacion> {
  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    const nombre = (error as Error).name;
    if (nombre === "NotAllowedError" || nombre === "SecurityError") {
      throw new Error("Necesitamos permiso para usar el micrófono. Activalo o escribí el texto.");
    }
    if (nombre === "NotFoundError") throw new Error("No encontramos un micrófono en este celular. Escribí el texto.");
    throw new Error("No pudimos abrir el micrófono. Probá de nuevo o escribilo.");
  }

  const soltarMicrofono = () => flujo.getTracks().forEach((pista) => pista.stop());

  let grabadora: MediaRecorder;
  try {
    const formato = FORMATOS.find((opcion) => MediaRecorder.isTypeSupported(opcion));
    // 48 kbps alcanza para la voz y deja un minuto en menos de 400 KB, que sube rápido con datos móviles.
    grabadora = new MediaRecorder(flujo, { ...(formato ? { mimeType: formato } : {}), audioBitsPerSecond: 48_000 });
  } catch {
    soltarMicrofono();
    throw new Error("Este celular no puede grabar audio acá. Escribí el texto.");
  }

  const trozos: Blob[] = [];
  grabadora.ondataavailable = (evento) => {
    if (evento.data.size > 0) trozos.push(evento.data);
  };

  const inicio = Date.now();
  const limite = setTimeout(alLlegarAlLimite, MAXIMO_SEGUNDOS * 1000);
  // Sin intervalo: el audio llega entero al cortar. Safari necesita el archivo mp4 completo para que se pueda leer.
  grabadora.start();

  function cortar(): Promise<void> {
    clearTimeout(limite);
    return new Promise((resolver) => {
      if (grabadora.state === "inactive") {
        soltarMicrofono();
        resolver();
        return;
      }
      grabadora.onstop = () => {
        soltarMicrofono();
        resolver();
      };
      grabadora.stop();
    });
  }

  return {
    async parar() {
      await cortar();
      const blob = new Blob(trozos, { type: grabadora.mimeType || trozos[0]?.type || "audio/webm" });
      if (Date.now() - inicio < MINIMO_MS || blob.size < 1000) return null;
      return { tipo: blob.type, base64: await enBase64(blob) };
    },
    descartar() {
      void cortar();
    },
  };
}
