// Iniciales de una persona en un círculo (no hay fotos de perfil: solo fotos de trabajos).
export function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

// `invertido` = fondo de tinta y letras claras (por ejemplo, el presupuesto elegido).
export function Avatar({ nombre, size = 48, invertido = false }: { nombre: string; size?: number; invertido?: boolean }) {
  return (
    <span
      className={`cifra inline-flex shrink-0 items-center justify-center rounded-full font-bold ${invertido ? "bg-ink text-white" : "bg-subtle text-ink"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </span>
  );
}
