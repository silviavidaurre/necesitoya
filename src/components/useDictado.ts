import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorDePedido, pedir } from "@/lib/cliente";
import { grabar, puedeGrabar, type Grabacion } from "@/lib/grabadora";
import { callar } from "@/lib/lectura";
import { vozEnServidor } from "@/lib/voz-cliente";

// Dictado por voz. Tiene dos caminos y quien lo usa no nota la diferencia:
// 1. El reconocimiento del navegador (Chrome y derivados): gratis y muestra el texto mientras la persona habla.
//    Trabaja en sesiones cortas que se reinician solas: en Android, el modo continuo
//    repite el texto acumulado y termina duplicando frases.
// 2. Grabar y transcribir en el servidor: para los celulares sin reconocimiento propio (iPhone, Firefox)
//    y para cuando el del navegador falla. El texto llega todo junto al terminar de grabar.

interface EventoResultado {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Reconocimiento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((evento: EventoResultado) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Constructor = new () => Reconocimiento;

function obtenerConstructor(): Constructor | null {
  if (typeof window === "undefined") return null;
  const ventana = window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor };
  return ventana.SpeechRecognition ?? ventana.webkitSpeechRecognition ?? null;
}

// Fallas del reconocimiento del navegador que no dependen del micrófono: grabando se resuelven.
const FALLAS_CON_RESPALDO = ["service-not-allowed", "network", "language-not-supported"];

// Si el reconocimiento del navegador falló una vez y hay respaldo, el resto de la visita se graba directamente.
let reconocimientoRoto = false;

export function useDictado(alTerminarFrase: (frase: string) => void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  // Se tocó "parar" y el reconocimiento del navegador todavía no confirmó que cortó.
  const [cerrando, setCerrando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState("");

  const reconocimiento = useRef<Reconocimiento | null>(null);
  const sesionAbierta = useRef(false);
  const quiereEscuchar = useRef(false);
  const aviso = useRef(alTerminarFrase);
  const vivo = useRef(true);
  // Respaldo: la grabación en curso, si se está abriendo el micrófono y la transcripción que falta llegar.
  const grabacion = useRef<Grabacion | null>(null);
  const abriendo = useRef(false);
  const cambiando = useRef(false);
  const pendiente = useRef<Promise<void> | null>(null);
  // Quien llamó a terminar() espera acá a que el reconocimiento del navegador entregue lo último.
  const alCerrarSesion = useRef<(() => void) | null>(null);
  // Lo último que se escuchó en la sesión abierta, y el reloj que la corta si el navegador no responde.
  const fraseAlDia = useRef("");
  const parcialAlDia = useRef("");
  const vigia = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parar tiene que parar SIEMPRE y enseguida. El reconocimiento del celular depende de internet: con mala señal
  // puede tardar muchísimo en avisar que cortó (o no avisar nunca). Si no confirma a tiempo, se lo corta acá,
  // se rescata lo último que se había escuchado y la pantalla queda libre.
  const cerrarALaFuerza = useCallback(() => {
    if (vigia.current) clearTimeout(vigia.current);
    vigia.current = null;
    const sesion = reconocimiento.current;
    if (sesion && sesionAbierta.current) {
      sesion.onresult = null;
      sesion.onerror = null;
      sesion.onend = null;
      try {
        sesion.abort();
      } catch {
        // Ya estaba cerrada.
      }
      const texto = fraseAlDia.current || parcialAlDia.current;
      fraseAlDia.current = "";
      parcialAlDia.current = "";
      if (texto) aviso.current(texto);
      sesionAbierta.current = false;
    }
    if (vivo.current) {
      setParcial("");
      setCerrando(false);
      if (!grabacion.current) setEscuchando(false);
    }
    alCerrarSesion.current?.();
    alCerrarSesion.current = null;
  }, []);

  // Pide cortar el reconocimiento del navegador y arma el reloj que lo fuerza si no responde.
  const pedirCierre = useCallback(() => {
    const sesion = reconocimiento.current;
    if (!sesion || !sesionAbierta.current) return;
    setEscuchando(false);
    setCerrando(true);
    try {
      sesion.stop();
    } catch {
      // Si no se puede pedir el corte, lo hace el reloj.
    }
    if (vigia.current) clearTimeout(vigia.current);
    vigia.current = setTimeout(cerrarALaFuerza, 1200);
  }, [cerrarALaFuerza]);

  useEffect(() => {
    aviso.current = alTerminarFrase;
  }, [alTerminarFrase]);

  useEffect(() => {
    vivo.current = true;
    if (obtenerConstructor() !== null) {
      setSoportado(true);
    } else if (puedeGrabar()) {
      // Sin reconocimiento propio, el micrófono solo sirve si el servidor puede transcribir.
      void vozEnServidor().then((hay) => {
        if (vivo.current) setSoportado(hay);
      });
    }
    return () => {
      vivo.current = false;
      quiereEscuchar.current = false;
      if (vigia.current) clearTimeout(vigia.current);
      // Si la pantalla pidió terminar(), se deja que llegue lo último que se dijo. Si no, se corta y se descarta.
      if (!alCerrarSesion.current) reconocimiento.current?.abort();
      grabacion.current?.descartar();
      grabacion.current = null;
    };
  }, []);

  // Corta la grabación y la manda a transcribir. La promesa termina cuando el texto ya se entregó.
  const cerrarGrabacion = useCallback((): Promise<void> => {
    const actual = grabacion.current;
    if (!actual) return pendiente.current ?? Promise.resolve();
    grabacion.current = null;
    setEscuchando(false);
    setTranscribiendo(true);

    const tarea = (async () => {
      const audio = await actual.parar();
      if (!audio) {
        if (vivo.current) setError("No llegamos a escucharte. Tocá, hablá y tocá de nuevo para terminar.");
        return;
      }
      const { texto } = await pedir<{ texto: string }>("/api/voz/transcribir", { method: "POST", body: JSON.stringify(audio) });
      if (texto) aviso.current(texto);
      else if (vivo.current) setError("No se entendió lo que dijiste. Probá de nuevo más cerca del micrófono, o escribilo.");
    })()
      .catch((falla: unknown) => {
        // Sin conexión llega un ErrorDePedido con estado 0 (o el TypeError de fetch): se dice qué hacer con el dictado.
        // El resto de los errores ya traen un mensaje para la persona.
        const sinRed = falla instanceof TypeError || (falla instanceof ErrorDePedido && falla.estado === 0);
        const mensaje =
          falla instanceof Error && !sinRed ? falla.message : "Sin conexión para pasar tu audio a texto. Probá de nuevo o escribilo.";
        if (vivo.current) setError(mensaje);
        throw new Error(mensaje);
      })
      .finally(() => {
        pendiente.current = null;
        if (vivo.current) setTranscribiendo(false);
      });
    pendiente.current = tarea;
    return tarea;
  }, []);

  const empezarGrabacion = useCallback(async () => {
    if (abriendo.current || grabacion.current || pendiente.current) return;
    abriendo.current = true;
    try {
      // Al minuto se corta sola, se avisa y se transcribe lo que haya.
      const nueva = await grabar(() => {
        void cerrarGrabacion().catch(() => {});
        if (vivo.current) setError("Se cortó al llegar al minuto. Tocá el micrófono para seguir contando.");
      });
      if (!vivo.current) {
        nueva.descartar();
        return;
      }
      grabacion.current = nueva;
      setEscuchando(true);
    } catch (falla) {
      if (vivo.current) {
        setEscuchando(false);
        setError(falla instanceof Error ? falla.message : "No pudimos abrir el micrófono. Probá de nuevo o escribilo.");
      }
    } finally {
      abriendo.current = false;
    }
  }, [cerrarGrabacion]);

  // El reconocimiento del navegador falló: si se puede, se sigue grabando sin que la persona tenga que hacer nada.
  const pasarAGrabar = useCallback(
    async (mensajeSiNoSePuede: string) => {
      quiereEscuchar.current = false;
      cambiando.current = true;
      const hayRespaldo = puedeGrabar() && (await vozEnServidor());
      cambiando.current = false;
      if (!vivo.current) return;
      if (hayRespaldo) {
        reconocimientoRoto = true;
        await empezarGrabacion();
      } else {
        setEscuchando(false);
        setError(mensajeSiNoSePuede);
      }
    },
    [empezarGrabacion],
  );

  const abrirSesion = useCallback(() => {
    const Ctor = obtenerConstructor();
    if (!Ctor) return;

    const sesion = new Ctor();
    sesion.lang = "es-AR";
    sesion.continuous = false;
    sesion.interimResults = true;
    let frase = "";
    fraseAlDia.current = "";
    parcialAlDia.current = "";

    sesion.onresult = (evento) => {
      const ultimo = evento.results[evento.results.length - 1];
      const texto = ultimo[0].transcript.trim();
      if (ultimo.isFinal) {
        frase = texto;
        fraseAlDia.current = texto;
        parcialAlDia.current = "";
        setParcial("");
      } else {
        parcialAlDia.current = texto;
        setParcial(texto);
      }
    };

    sesion.onerror = (evento) => {
      if (evento.error === "no-speech" || evento.error === "aborted") return;
      quiereEscuchar.current = false;
      const mensaje =
        evento.error === "not-allowed" || evento.error === "service-not-allowed"
          ? "Necesitamos permiso para usar el micrófono. Activalo o escribí el texto."
          : "No pudimos escucharte. Probá de nuevo o escribilo.";
      if (FALLAS_CON_RESPALDO.includes(evento.error)) {
        void pasarAGrabar(mensaje);
        return;
      }
      setError(mensaje);
    };

    sesion.onend = () => {
      if (frase) aviso.current(frase);
      fraseAlDia.current = "";
      parcialAlDia.current = "";
      setParcial("");
      if (quiereEscuchar.current) {
        abrirSesion();
        return;
      }
      if (vigia.current) clearTimeout(vigia.current);
      vigia.current = null;
      setCerrando(false);
      sesionAbierta.current = false;
      // Si justo se está pasando a grabar, el estado lo lleva la grabación.
      if (!cambiando.current && !abriendo.current && !grabacion.current) setEscuchando(false);
      alCerrarSesion.current?.();
      alCerrarSesion.current = null;
    };

    reconocimiento.current = sesion;
    try {
      sesion.start();
      sesionAbierta.current = true;
    } catch {
      quiereEscuchar.current = false;
      sesionAbierta.current = false;
      setEscuchando(false);
      setError("No pudimos abrir el micrófono. Probá de nuevo o escribilo.");
    }
  }, [pasarAGrabar]);

  const empezar = useCallback(() => {
    setError("");
    // Si la app estaba leyendo algo en voz alta, se corta: si no, el micrófono graba la voz de la app.
    callar();
    if (reconocimientoRoto || obtenerConstructor() === null) {
      void empezarGrabacion();
      return;
    }
    quiereEscuchar.current = true;
    setEscuchando(true);
    abrirSesion();
  }, [abrirSesion, empezarGrabacion]);

  const parar = useCallback(() => {
    quiereEscuchar.current = false;
    pedirCierre();
    void cerrarGrabacion().catch(() => {});
  }, [cerrarGrabacion, pedirCierre]);

  // Como parar, pero avisa cuando lo último que se dijo ya está entregado: la pantalla lo espera antes de avanzar.
  // Falla con un mensaje para la persona si la transcripción no se pudo hacer.
  const terminar = useCallback((): Promise<void> => {
    quiereEscuchar.current = false;
    const delNavegador = sesionAbierta.current
      ? new Promise<void>((resolver) => {
          alCerrarSesion.current = resolver;
          // Si el navegador nunca avisa que cerró, el reloj lo corta y no se deja a la persona esperando.
          pedirCierre();
        })
      : Promise.resolve();
    return Promise.all([delNavegador, cerrarGrabacion()]).then(() => undefined);
  }, [cerrarGrabacion, pedirCierre]);

  return { soportado, escuchando, transcribiendo: transcribiendo || cerrando, parcial, error, empezar, parar, terminar };
}
