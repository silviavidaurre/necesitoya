// Limpieza de texto que llega del navegador antes de guardarlo.

// Caracteres de control e invisibles (menos el salto de línea, código 10): no se ven en pantalla,
// pero al guardarlos ocupan seis veces más y sirven para inflar la base a propósito.
function esInvisible(codigo: number) {
  return (
    (codigo < 32 && codigo !== 10) ||
    (codigo >= 127 && codigo <= 159) ||
    (codigo >= 0x200b && codigo <= 0x200f) ||
    (codigo >= 0x2028 && codigo <= 0x202f) ||
    codigo === 0xfeff
  );
}

export function limpiarTexto(valor: unknown, maximo: number) {
  if (typeof valor !== "string") return "";
  let limpio = "";
  for (const letra of valor) {
    if (!esInvisible(letra.codePointAt(0) ?? 0)) limpio += letra;
  }
  return limpio.trim().slice(0, maximo);
}

export function limpiarLista(valor: unknown, maximoItems: number, maximoLargo: number) {
  if (!Array.isArray(valor)) return [];
  const limpios = valor.map((v) => limpiarTexto(v, maximoLargo)).filter(Boolean);
  return [...new Set(limpios)].slice(0, maximoItems);
}

// Como limpiarTexto, pero si el texto es más largo que el máximo lo corta donde termina una oración
// (o, si no hay ninguna cerca, en el último espacio con "…"), para no mostrar palabras partidas.
export function limpiarTextoProlijo(valor: unknown, maximo: number) {
  const entero = limpiarTexto(valor, Number.MAX_SAFE_INTEGER);
  if (entero.length <= maximo) return entero;
  const corte = entero.slice(0, maximo);
  const finDeOracion = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("; "), corte.endsWith(".") ? corte.length - 1 : -1);
  if (finDeOracion >= maximo * 0.5) return corte.slice(0, finDeOracion + 1).replace(/;$/, ".");
  const espacio = corte.slice(0, maximo - 1).lastIndexOf(" ");
  return `${corte.slice(0, espacio > 0 ? espacio : maximo - 1).replace(/[\s,;:]+$/, "")}…`;
}
