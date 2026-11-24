import type { Reputacion as DatosDeReputacion } from "@/lib/tipos";

function Estrella({ llena, size }: { llena: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={llena ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
    </svg>
  );
}

// Fila de estrellas. Si recibe alElegir, sirve para calificar tocando.
export function Estrellas({ valor, size = 18, alElegir }: { valor: number; size?: number; alElegir?: (estrellas: number) => void }) {
  const numeros = [1, 2, 3, 4, 5];
  if (!alElegir) {
    return (
      <span className="inline-flex gap-0.5 text-ink" role="img" aria-label={`${valor} de 5 estrellas`}>
        {numeros.map((n) => (
          <Estrella key={n} llena={n <= Math.round(valor)} size={size} />
        ))}
      </span>
    );
  }
  return (
    <div className="flex justify-center gap-1" role="radiogroup" aria-label="Calificación">
      {numeros.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
          onClick={() => alElegir(n)}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${n <= valor ? "text-ink" : "text-ink-400"}`}
        >
          <Estrella llena={n <= valor} size={36} />
        </button>
      ))}
    </div>
  );
}

function promedioEnTexto(promedio: number) {
  return promedio.toFixed(1).replace(".", ",");
}

// Resumen en una línea: "4,8 · 12 trabajos" o, si todavía no tiene historial, "Nuevo en NecesitoYa".
export function ResumenDeReputacion({ reputacion, aniosExperiencia = 0 }: { reputacion: DatosDeReputacion; aniosExperiencia?: number }) {
  const partes: string[] = [];
  if (reputacion.trabajos > 0) partes.push(`${reputacion.trabajos} ${reputacion.trabajos === 1 ? "trabajo" : "trabajos"}`);
  if (aniosExperiencia > 0) partes.push(`${aniosExperiencia} años de experiencia`);
  if (reputacion.promedio === null && partes.length === 0) partes.push("Nuevo en NecesitoYa");

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm text-ink-500">
      {reputacion.promedio !== null && (
        <span className="inline-flex items-center gap-1 font-semibold text-ink">
          <Estrella llena size={14} />
          {promedioEnTexto(reputacion.promedio)}
        </span>
      )}
      {reputacion.promedio !== null && partes.length > 0 && <span aria-hidden="true">·</span>}
      {partes.join(" · ")}
    </span>
  );
}
