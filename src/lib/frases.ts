// Frases para leer en voz alta. Se arman como las diría una persona, no como una lista de etiquetas.
// No importa nada de la app (salvo tipos), así se puede probar suelto.
import type { Urgencia } from "./tipos";

// El servidor de voz no lee más que esto por vez.
export const MAXIMO_PARA_LEER = 600;

const miles = new Intl.NumberFormat("es-AR");

// Un monto como se dice: "85.000 pesos". Sin el signo $, que la voz no sabe leer.
// Los millones van en palabras ("1 millón 250.000 pesos"): con muchos puntos la voz se confunde.
function numeroEnVoz(entero: number) {
  if (entero < 1_000_000) return miles.format(entero);
  const millones = Math.floor(entero / 1_000_000);
  const resto = entero % 1_000_000;
  const cabeza = `${millones} ${millones === 1 ? "millón" : "millones"}`;
  return resto === 0 ? cabeza : `${cabeza} ${miles.format(resto)}`;
}

export function montoEnVoz(monto: number) {
  const entero = Math.round(monto);
  const millonesJustos = entero >= 1_000_000 && entero % 1_000_000 === 0;
  return `${numeroEnVoz(entero)} ${millonesJustos ? "de pesos" : "pesos"}`;
}

function conPunto(texto: string) {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  return /[.!?…]$/.test(limpio) ? limpio : `${limpio}.`;
}

function enMinuscula(texto: string) {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

// Acorta un texto hasta el final de una oración que entre en el lugar que queda. Si no entra ninguna, lo saca.
function acortar(texto: string, lugar: number) {
  if (texto.length <= lugar) return texto;
  const oraciones = texto.match(/[^.!?…]+[.!?…]+/g) ?? [];
  let resultado = "";
  for (const oracion of oraciones) {
    if ((resultado + oracion).trim().length > lugar) break;
    resultado += oracion;
  }
  return resultado.trim();
}

// Une las partes sin pasarse del máximo. Las partes "opcionales" son las que se acortan o se sacan si no entran.
function unir(partes: { texto: string; opcional?: boolean }[]) {
  const fijo = partes.filter((p) => !p.opcional && p.texto).reduce((total, p) => total + p.texto.length + 1, 0);
  let lugar = MAXIMO_PARA_LEER - fijo;
  const elegidas: string[] = [];
  for (const parte of partes) {
    if (!parte.texto) continue;
    if (!parte.opcional) {
      elegidas.push(parte.texto);
      continue;
    }
    const corta = acortar(parte.texto, lugar - 1);
    if (corta) {
      elegidas.push(corta);
      lugar -= corta.length + 1;
    }
  }
  return elegidas.join(" ").slice(0, MAXIMO_PARA_LEER);
}

const PARA_CUANDO: Record<Urgencia, string> = {
  hoy: "para hoy",
  semana: "para esta semana",
  flexible: "sin apuro",
};

function fraseDelRango(min: number | null, max: number | null) {
  if (min === null || max === null) return "";
  return `Suele costar entre ${numeroEnVoz(Math.round(min))} y ${montoEnVoz(max)} de mano de obra.`;
}

// Paso "revisar" del vecino: lo que la app entendió y cuánto suele costar.
// No lee el detalle para el prestador: repite lo que la persona acaba de contar y alarga la espera.
export function frasePedidoPorRevisar(pedido: {
  titulo: string;
  rubro: string;
  // "Otros trabajos" no se nombra: "un trabajo de otros trabajos" no lo dice nadie.
  esOtroRubro: boolean;
  zona: string;
  urgencia: Urgencia;
  precioMin: number | null;
  precioMax: number | null;
}) {
  const tipo = pedido.esOtroRubro ? "Es" : `Es un trabajo de ${pedido.rubro.toLowerCase()}`;
  return unir([
    { texto: `Entendí que necesitás esto: ${conPunto(enMinuscula(pedido.titulo.trim()))}` },
    { texto: `${tipo}${pedido.zona ? ` en ${pedido.zona}` : ""}, ${PARA_CUANDO[pedido.urgencia]}.` },
    { texto: fraseDelRango(pedido.precioMin, pedido.precioMax) },
    { texto: "Si está bien, tocá seguir. Si no, corregilo en pantalla." },
  ]);
}

function cuandoPuedeIr(cuando: string) {
  const limpio = cuando.trim().toLowerCase();
  return limpio === "a coordinar" ? "el día es a coordinar" : `puede ir ${limpio}`;
}

// Seguimiento del vecino: los presupuestos que llegaron, uno por uno.
export function frasePresupuestos(
  ofertas: { precio: number; cuando: string; mensaje: string; prestador: { nombre: string; aniosExperiencia: number } }[],
) {
  if (ofertas.length === 0) return "Todavía no llegó ningún presupuesto. Aparecen acá apenas respondan.";
  const partes: { texto: string; opcional?: boolean }[] = [
    { texto: ofertas.length === 1 ? "Tenés 1 presupuesto." : `Tenés ${ofertas.length} presupuestos.` },
  ];
  for (const oferta of ofertas) {
    const pila = oferta.prestador.nombre.trim().split(" ")[0];
    const anios = oferta.prestador.aniosExperiencia;
    const experiencia = anios > 0 ? `, ${anios} ${anios === 1 ? "año" : "años"} de experiencia,` : "";
    partes.push({ texto: `${pila}${experiencia} te pasó ${montoEnVoz(oferta.precio)} y ${cuandoPuedeIr(oferta.cuando)}.` });
    if (oferta.mensaje.trim()) partes.push({ texto: `Dice: ${conPunto(oferta.mensaje)}`, opcional: true });
  }
  partes.push({ texto: ofertas.length === 1 ? "Si te sirve, tocá elegir." : "Elegí el que más te sirva." });
  return unir(partes);
}

// Pantalla de presupuestar del prestador: el pedido que está por cotizar.
export function frasePedidoParaPresupuestar(pedido: {
  titulo: string;
  descripcion: string;
  rubro: string;
  esOtroRubro: boolean;
  zona: string;
  urgencia: Urgencia;
  ejemplo: boolean;
  precioMin: number | null;
  precioMax: number | null;
}) {
  const tipo = pedido.esOtroRubro ? "" : ` de ${pedido.rubro.toLowerCase()}`;
  return unir([
    { texto: `${pedido.ejemplo ? "Pedido de ejemplo" : "Pedido"}${tipo} en ${pedido.zona}, ${PARA_CUANDO[pedido.urgencia]}: ${conPunto(enMinuscula(pedido.titulo.trim()))}` },
    { texto: conPunto(pedido.descripcion), opcional: true },
    { texto: fraseDelRango(pedido.precioMin, pedido.precioMax) },
  ]);
}
