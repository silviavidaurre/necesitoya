// Lectura en voz alta del lado del navegador. Hay un solo parlante para toda la app:
// así nunca suenan dos audios juntos, y empezar uno corta el anterior.

export type EstadoDeLectura = "quieto" | "cargando" | "sonando";
type Aviso = (estado: EstadoDeLectura) => void;

let parlante: HTMLAudioElement | null = null;
// Cada lectura toma un turno. Si al volver de una espera el turno cambió, esa lectura quedó cancelada.
let turno = 0;
let avisoActual: Aviso | null = null;
let pedidoEnCurso: AbortController | null = null;
let silencio: string | null = null;

// Audios ya pedidos en esta visita: volver a escuchar lo mismo no gasta datos ni saldo de voz.
const guardados = new Map<string, string>();
const MAXIMO_GUARDADOS = 6;

function elParlante() {
  if (!parlante) {
    parlante = new Audio();
    parlante.preload = "auto";
  }
  return parlante;
}

function guardar(texto: string, url: string) {
  guardados.set(texto, url);
  if (guardados.size > MAXIMO_GUARDADOS) {
    const [masViejo, urlVieja] = guardados.entries().next().value as [string, string];
    guardados.delete(masViejo);
    URL.revokeObjectURL(urlVieja);
  }
}

// Un instante de silencio en WAV, armado acá para no depender de ningún archivo.
function urlDeSilencio() {
  if (silencio) return silencio;
  const muestras = 400;
  const bytes = new Uint8Array(44 + muestras * 2);
  const vista = new DataView(bytes.buffer);
  const letras = (posicion: number, palabra: string) => [...palabra].forEach((letra, i) => vista.setUint8(posicion + i, letra.charCodeAt(0)));
  letras(0, "RIFF");
  vista.setUint32(4, 36 + muestras * 2, true);
  letras(8, "WAVEfmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, 8000, true);
  vista.setUint32(28, 16000, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  letras(36, "data");
  vista.setUint32(40, muestras * 2, true);
  silencio = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return silencio;
}

// Hay que llamarla dentro de un toque de la persona. El iPhone solo deja sonar un audio que arrancó con un toque:
// reproducir un instante de silencio en ese momento habilita al parlante para lo que venga después
// (el audio real llega del servidor uno o dos segundos más tarde, cuando el toque ya pasó).
export function prepararParlante() {
  const audio = elParlante();
  if (!audio.paused) return;
  audio.onended = null;
  audio.onerror = null;
  audio.src = urlDeSilencio();
  audio.play().catch(() => {
    // Si el navegador no lo permite, la lectura automática no suena y queda el botón Escuchar.
  });
}

// Corta lo que esté sonando o cargándose.
export function callar() {
  turno++;
  pedidoEnCurso?.abort();
  pedidoEnCurso = null;
  if (parlante) {
    parlante.onended = null;
    parlante.onerror = null;
    parlante.pause();
  }
  avisoActual?.("quieto");
  avisoActual = null;
}

// Lee el texto en voz alta y avisa cada cambio de estado.
// Devuelve "bloqueado" si el navegador no dejó sonar el audio sin un toque, y lanza un error con un mensaje
// para la persona si el audio no se pudo conseguir.
export async function leerEnVozAlta(texto: string, avisar: Aviso): Promise<"listo" | "bloqueado"> {
  callar();
  const mio = ++turno;
  avisoActual = avisar;
  avisar("cargando");

  const terminar = () => {
    if (mio !== turno) return;
    avisoActual = null;
    avisar("quieto");
  };

  try {
    let url = guardados.get(texto);
    if (!url) {
      pedidoEnCurso = new AbortController();
      const respuesta = await fetch("/api/voz/decir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
        signal: pedidoEnCurso.signal,
      });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? "No pudimos leerlo en voz alta. Probá de nuevo o leelo en pantalla.");
      }
      const audio = await respuesta.blob();
      if (mio !== turno) return "listo";
      url = URL.createObjectURL(audio);
      guardar(texto, url);
    }

    const audio = elParlante();
    audio.onended = terminar;
    audio.onerror = terminar;
    audio.src = url;
    try {
      await audio.play();
    } catch (falla) {
      if (mio !== turno) return "listo";
      terminar();
      if ((falla as Error).name === "NotAllowedError") return "bloqueado";
      throw new Error("No pudimos reproducir el audio. Probá de nuevo o leelo en pantalla.");
    }
    if (mio === turno) avisar("sonando");
    return "listo";
  } catch (falla) {
    // Si la cortó otra lectura o la persona, no es un error.
    if (mio !== turno) return "listo";
    terminar();
    if (falla instanceof TypeError) throw new Error("Sin conexión para leerlo en voz alta. Probá de nuevo o leelo en pantalla.");
    throw falla;
  }
}
