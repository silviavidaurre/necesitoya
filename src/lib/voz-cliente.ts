// Del lado del navegador: saber si el servidor tiene voz, para mostrar u ocultar lo que depende de ella.

let consulta: Promise<boolean> | null = null;

// Se pregunta una sola vez por visita. Si la consulta falla (sin señal), la próxima vez se vuelve a intentar.
export function vozEnServidor(): Promise<boolean> {
  if (!consulta) {
    consulta = fetch("/api/voz", { cache: "no-store" })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
      .then((datos: { voz?: unknown } | null) => datos?.voz === true)
      .catch(() => {
        consulta = null;
        return false;
      });
  }
  return consulta;
}
