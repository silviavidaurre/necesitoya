import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/ui";
import { callar, leerEnVozAlta, prepararParlante, type EstadoDeLectura } from "@/lib/lectura";
import { vozEnServidor } from "@/integraciones/elevenlabs-voz/voz-cliente";

// Acción secundaria, en píldora con borde, para que la app lea en voz alta lo que hay en pantalla.
// Tocar de nuevo corta el audio. Si el servidor no tiene voz, no aparece: la pantalla queda igual que antes.
export function BotonEscuchar({
  texto,
  automatico = false,
}: {
  // Frase completa y natural, armada por la pantalla (ver lib/frases.ts).
  texto: string;
  // Empieza a leer apenas aparece, sin toque. Se usa cuando la persona vino hablando.
  // Si el navegador no deja sonar audio sin un toque, no pasa nada: queda el botón.
  automatico?: boolean;
}) {
  const [hayVoz, setHayVoz] = useState(false);
  const [estado, setEstado] = useState<EstadoDeLectura>("quieto");
  const [error, setError] = useState("");
  // El texto cambia mientras la persona corrige el pedido: se lee siempre la última versión.
  const ultimoTexto = useRef(texto);
  useEffect(() => {
    ultimoTexto.current = texto;
  }, [texto]);
  const leyendo = useRef(false);

  useEffect(() => {
    let vigente = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    void vozEnServidor().then((hay) => {
      if (!vigente) return;
      setHayVoz(hay);
      if (!hay || !automatico) return;
      // Una pausa corta: la pantalla termina de aparecer y recién después habla.
      espera = setTimeout(() => {
        leyendo.current = true;
        // En la lectura automática las fallas no se muestran: la persona no pidió nada todavía.
        leerEnVozAlta(ultimoTexto.current, actualizar).catch(() => {});
      }, 400);
    });
    function actualizar(nuevo: EstadoDeLectura) {
      leyendo.current = nuevo !== "quieto";
      if (vigente) setEstado(nuevo);
    }
    return () => {
      vigente = false;
      clearTimeout(espera);
      // Al salir de la pantalla se corta el audio y el pedido en curso.
      if (leyendo.current) callar();
      leyendo.current = false;
    };
    // Solo al aparecer: que cambie el texto no tiene que volver a disparar la lectura.
  }, []);

  if (!hayVoz) return null;

  function alTocar() {
    setError("");
    if (estado !== "quieto") {
      callar();
      return;
    }
    // Dentro del toque, para que el iPhone deje sonar el audio que llega un momento después.
    prepararParlante();
    leyendo.current = true;
    leerEnVozAlta(ultimoTexto.current, (nuevo) => {
      leyendo.current = nuevo !== "quieto";
      setEstado(nuevo);
    })
      .then((resultado) => {
        if (resultado === "bloqueado") setError("El celular no dejó sonar el audio. Tocá Escuchar de nuevo.");
      })
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : "No pudimos leerlo en voz alta. Probá de nuevo o leelo en pantalla.");
      });
  }

  return (
    <div>
      <button
        type="button"
        onClick={alTocar}
        aria-busy={estado === "cargando"}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-semibold text-ink active:bg-subtle"
      >
        <Icono nombre={estado === "quieto" ? "altavoz" : "detener"} size={18} />
        {estado === "sonando" ? "Parar" : estado === "cargando" ? "Preparando la voz" : "Escuchar"}
      </button>
      {/* Para lectores de pantalla: avisa que el audio se está preparando sin mover el foco. */}
      <span role="status" className="sr-only">
        {estado === "cargando" ? "Preparando la voz" : ""}
      </span>
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
