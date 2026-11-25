import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useCerrarConAtras } from "@/components/useAtras";
import { ChipDesplegable, Icono } from "@/components/ui";

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Hoja que sube desde abajo, encima de la pantalla: para elegir una opción (barrio, urgencia, oficio) o leer algo corto.
// Se cierra con la X, tocando afuera, con Escape o con el botón atrás del celular. Mientras está abierta el foco queda
// adentro, la pantalla de atrás no se desplaza y, al cerrarse, el foco vuelve a lo que la abrió.
export function HojaDeAbajo({ titulo, alCerrar, children, pie }: { titulo: string; alCerrar: () => void; children: ReactNode; pie?: ReactNode }) {
  const idTitulo = useId();
  const hoja = useRef<HTMLDivElement>(null);
  useCerrarConAtras(alCerrar);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    hoja.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = desplazamiento;
      if (anterior?.isConnected) anterior.focus({ preventScroll: true });
    };
  }, []);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      alCerrar();
      return;
    }
    if (evento.key !== "Tab" || !hoja.current) return;
    const enfocables = [...hoja.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    const activo = document.activeElement;
    if (evento.shiftKey && (activo === primero || activo === hoja.current)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 mx-auto flex w-full max-w-md flex-col justify-end" onKeyDown={alTeclear}>
      <div className="absolute inset-0 bg-black/45" onClick={alCerrar} aria-hidden="true" />
      <div
        ref={hoja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="subir relative flex max-h-[88dvh] flex-col rounded-t-[28px] bg-white pt-2.5 outline-none"
        style={{ boxShadow: "var(--sombra-panel)" }}
      >
        <span className="mb-1 h-[5px] w-10 shrink-0 self-center rounded-full bg-line" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
          <h2 id={idTitulo} className="text-[21px] font-bold leading-tight tracking-[-0.01em] text-ink">
            {titulo}
          </h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-ink active:bg-line">
            <Icono nombre="cerrar" size={20} />
          </button>
        </div>
        <div className={`sin-barra min-h-0 flex-1 overflow-y-auto px-5 ${pie ? "pb-3" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))]"}`}>{children}</div>
        {pie && <div className="shrink-0 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">{pie}</div>}
      </div>
    </div>
  );
}

// Una opción dentro de la hoja: ícono, texto y, si es la elegida, una tilde.
export function OpcionDeHoja({ icono, titulo, detalle, elegida = false, onClick }: { icono?: string; titulo: string; detalle?: string; elegida?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={elegida} onClick={onClick} className="flex min-h-14 w-full items-center gap-4 border-b border-line py-2 text-left last:border-b-0">
      {icono && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-ink">
          <Icono nombre={icono} size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-base text-ink ${elegida ? "font-bold" : "font-semibold"}`}>{titulo}</span>
        {detalle && <span className="block text-sm text-ink-500">{detalle}</span>}
      </span>
      {elegida && <Icono nombre="check" size={22} className="shrink-0 text-ink" />}
    </button>
  );
}

export interface Opcion<T extends string> {
  id: T;
  texto: string;
  icono?: string;
  detalle?: string;
}

// Chip ▾ que abre una hoja con opciones fijas (urgencia, oficio, filtros). Elegir una la cierra.
export function ChipConOpciones<T extends string>({
  titulo,
  opciones,
  valor,
  alCambiar,
  texto,
  icono,
  etiqueta,
  variante,
}: {
  // Título de la hoja: "¿Para cuándo?".
  titulo: string;
  opciones: Opcion<T>[];
  valor: T | null;
  alCambiar: (valor: T) => void;
  // Lo que dice el chip (por defecto, el texto de la opción elegida).
  texto?: string;
  icono?: string;
  etiqueta?: string;
  variante?: "relleno" | "borde" | "flotante";
}) {
  const [abierta, setAbierta] = useState(false);
  const elegida = opciones.find((o) => o.id === valor);
  return (
    <>
      <ChipDesplegable icono={icono ?? elegida?.icono} variante={variante} onClick={() => setAbierta(true)} etiqueta={etiqueta}>
        {texto ?? elegida?.texto ?? titulo}
      </ChipDesplegable>
      {abierta && (
        <HojaDeAbajo titulo={titulo} alCerrar={() => setAbierta(false)}>
          {opciones.map((opcion) => (
            <OpcionDeHoja
              key={opcion.id}
              icono={opcion.icono}
              titulo={opcion.texto}
              detalle={opcion.detalle}
              elegida={opcion.id === valor}
              onClick={() => {
                alCambiar(opcion.id);
                setAbierta(false);
              }}
            />
          ))}
        </HojaDeAbajo>
      )}
    </>
  );
}
