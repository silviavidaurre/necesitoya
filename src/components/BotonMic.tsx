import { Icono } from "@/components/ui";

// Micrófono: el objeto protagonista de las pantallas donde se cuenta algo con la voz.
// `principal` lo pinta con el color de la acción principal: se usa cuando todavía no hay nada contado y hablar es
// LA acción de la pantalla. En cuanto hay texto vuelve a gris, porque el color pasa al botón de continuar
// (una sola acción principal por vez).
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
  // Grande: un círculo de 88 px con un aro de 12 px (112 en total), como en la pantalla Contar.
  const medida = grande ? "h-[88px] w-[88px]" : "h-12 w-12";
  const color = escuchando
    ? "grabando bg-subtle text-ink ring-2 ring-danger"
    : principal
      ? `bg-brand text-white ${grande ? "ring-[12px] ring-subtle" : ""}`
      : `bg-subtle text-ink ${grande ? "ring-[12px] ring-subtle" : ""}`;
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
        <Icono nombre="mic" size={grande ? 36 : 22} />
      )}
    </button>
  );
}
