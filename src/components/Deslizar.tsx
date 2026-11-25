import { useId, useRef, useState, type PointerEvent } from "react";
import { Icono } from "@/components/ui";

const TOPE = 0.85;

// Confirmar deslizando, para no cambiar el estado del trabajo sin querer: se arrastra la flecha hasta el final.
// Es un <button>: con teclado (Enter o espacio) se activa como cualquier botón. Un toque sin deslizar no cambia
// nada: muestra cómo se usa y un botón "Confirmar" aparte, para quien no puede arrastrar (VoiceOver, acceso por
// interruptor, control por voz). Así sigue haciendo falta un gesto deliberado: deslizar, o tocar dos veces.
export function DeslizarParaConfirmar({
  texto,
  accion,
  alConfirmar,
  ocupado = false,
}: {
  // Lo que se ve en la pista: "Deslizá cuando llegues".
  texto: string;
  // Lo que hace, para el lector de pantalla: "Llegué".
  accion: string;
  alConfirmar: () => void;
  ocupado?: boolean;
}) {
  const idAyuda = useId();
  const pista = useRef<HTMLButtonElement>(null);
  const inicio = useRef<number | null>(null);
  // true mientras el toque viene de un dedo o un mouse: el click que le sigue no confirma.
  const conPuntero = useRef(false);
  const [avance, setAvance] = useState(0);
  const [aviso, setAviso] = useState(false);
  // El dedo que empezó el gesto: un segundo dedo no lo mueve ni lo termina.
  const dedo = useRef<number | null>(null);

  const recorrido = () => Math.max(1, (pista.current?.clientWidth ?? 300) - 64);
  const avanceEn = (x: number) => (inicio.current === null ? 0 : Math.max(0, Math.min(1, (x - inicio.current) / recorrido())));

  function alApretar(e: PointerEvent<HTMLButtonElement>) {
    if (ocupado || !e.isPrimary) return;
    conPuntero.current = true;
    dedo.current = e.pointerId;
    inicio.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function alMover(e: PointerEvent<HTMLButtonElement>) {
    if (inicio.current === null || e.pointerId !== dedo.current) return;
    setAvance(avanceEn(e.clientX));
  }

  // Se mide donde se soltó (no el último dibujo): un deslizamiento rápido también llega al final.
  function alSoltar(e: PointerEvent<HTMLButtonElement>) {
    if (inicio.current === null || e.pointerId !== dedo.current) return;
    const final = Math.max(avance, avanceEn(e.clientX));
    inicio.current = null;
    dedo.current = null;
    if (final >= TOPE) {
      setAvance(1);
      // Confirmado con el gesto: el atajo "Confirmar" se esconde, así el paso siguiente vuelve a pedir deslizar.
      setAviso(false);
      alConfirmar();
      setTimeout(() => setAvance(0), 600);
    } else {
      if (final < 0.05) setAviso(true);
      setAvance(0);
    }
  }

  return (
    <div>
      {/* Va arriba del control: el pie crece hacia arriba y el control no se mueve bajo el dedo
          (si apareciera abajo, el mismo toque caería sobre "Confirmar"). */}
      {aviso && (
        <div className="mb-2 flex flex-col items-center" aria-live="polite">
          <p className="text-center text-[13px] font-semibold text-ink">Arrastrá la flecha hasta el final, o tocá Confirmar.</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              setAviso(false);
              alConfirmar();
            }}
            className="flex min-h-11 items-center px-4 text-[15px] font-bold text-ink underline underline-offset-[3px]"
          >
            Confirmar: {accion}
          </button>
        </div>
      )}
      <button
        ref={pista}
        type="button"
        disabled={ocupado}
        aria-label={`${texto}. Avisar al vecino: ${accion}`}
        aria-describedby={idAyuda}
        aria-busy={ocupado}
        onPointerDown={alApretar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={() => {
          inicio.current = null;
          dedo.current = null;
          setAvance(0);
        }}
        onClick={(e) => {
          // Teclado o lector de pantalla (sin puntero, o un click sintético con detail 0): confirma como un botón.
          if ((!conPuntero.current || e.detail === 0) && !ocupado) alConfirmar();
          conPuntero.current = false;
        }}
        className="relative flex h-16 w-full touch-none select-none items-center rounded-full bg-brand p-1.5 text-[17px] font-bold text-white disabled:opacity-80"
      >
        <span
          className={`relative z-[1] flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white text-brand ${inicio.current === null ? "transition-transform duration-200 motion-reduce:transition-none" : ""}`}
          style={{ transform: `translateX(${avance * recorrido()}px)` }}
          aria-hidden="true"
        >
          {ocupado ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icono nombre="flecha" size={24} />}
        </span>
        <span className="flex-1 pr-[52px] text-center" style={{ opacity: 1 - avance * 0.8 }} aria-hidden="true">
          {ocupado ? "Avisando" : texto}
        </span>
      </button>
      <p id={idAyuda} className="sr-only">
        Deslizá la flecha hasta el final para avisarle al vecino.
      </p>
    </div>
  );
}
