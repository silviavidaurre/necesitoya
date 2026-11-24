import { Icono } from "@/components/ui";

// Micrófono: el objeto protagonista de las pantallas donde se cuenta algo con la voz.
// `principal` lo pinta de azul: se usa cuando todavía no hay nada contado y hablar es LA acción de la pantalla.
// En cuanto hay texto vuelve a gris, porque el azul pasa al botón de continuar (una sola acción azul por vez).
export function BotonMic({
  escuchando,
  onClick,
  grande = false,
  principal = false,
  etiqueta,
  ocupado = false,
}: {
  escuchando: boolean;
  onClick: () => void;
  grande?: boolean;
  principal?: boolean;
  etiqueta?: string;
  // Mientras lo grabado se pasa a texto no se puede volver a grabar.
  ocupado?: boolean;
}) {
  const medida = grande ? (principal ? "h-[124px] w-[124px]" : "h-[88px] w-[88px]") : "h-12 w-12";
  const color = escuchando
    ? "grabando bg-subtle text-ink ring-2 ring-danger"
    : principal
      ? "bg-brand text-white ring-[10px] ring-brand-50"
      : "bg-subtle text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      aria-label={etiqueta ?? (escuchando ? "Terminar de grabar" : "Hablar")}
      className={`${medida} ${color} inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60`}
    >
      {escuchando ? (
        <span className={`${grande ? "h-8 w-8 rounded-lg" : "h-4 w-4 rounded"} bg-danger`} />
      ) : (
        <Icono nombre="mic" size={grande ? (principal ? 52 : 38) : 22} />
      )}
    </button>
  );
}
