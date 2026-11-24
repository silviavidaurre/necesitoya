import type { BaseDeDatos, Mensaje, Oferta } from "./tipos";

// Reglas del chat de un presupuesto. Todo el contacto pasa por la app: nadie ve el teléfono de nadie,
// y lo que se parezca a un teléfono o a un enlace de WhatsApp se tapa antes de guardar el mensaje.

export const MAX_LARGO_MENSAJE = 500;
export const MAX_MENSAJES_POR_CHAT = 200;
export const OCULTO = "[número oculto]";

export type Lado = Mensaje["de"];

// Enlaces para escribirse por afuera: wa.me, wa.link y cualquier dirección de whatsapp.com.
const ENLACE_WHATSAPP = /(?:https?:[/][/])?(?:www[.])?(?:wa[.]me|wa[.]link|(?:[a-z]+[.])?whatsapp[.]com)(?:[/?][^ \n]*)?/gi;

// Siete o más dígitos seguidos, aunque vengan separados: por un punto solo ("388.412.3456")
// o por hasta tres espacios, guiones o paréntesis ("(388) 412 - 3456", "3 8 8 4 1 2 3 4 5 6").
const TELEFONO = /[+(]?[0-9](?:(?:[.]|[ ()-]{1,3})?[0-9]){6,}/g;

// Un precio escrito con puntos de miles: 1.500.000.
const PRECIO_CON_PUNTOS = /^[0-9]{1,3}(?:[.][0-9]{3})+$/;

// Los precios grandes también tienen siete dígitos. No se tapan si llevan el signo $ adelante
// o están escritos con puntos de miles, siempre que no pasen de ocho dígitos (un celular tiene diez).
function esPrecio(trozo: string, antes: string) {
  const digitos = trozo.replace(/[^0-9]/g, "").length;
  if (digitos > 8) return false;
  return /[$] ?$/.test(antes) || PRECIO_CON_PUNTOS.test(trozo);
}

// Devuelve el texto con los teléfonos y enlaces de WhatsApp tapados, y si hubo que tapar algo.
// Un número de calle ("Belgrano 1234") o un precio ("85.000") quedan como están: tienen menos de siete dígitos.
export function ocultarContacto(texto: string): { texto: string; oculto: boolean } {
  let oculto = false;
  const sinEnlaces = texto.replace(ENLACE_WHATSAPP, () => {
    oculto = true;
    return OCULTO;
  });
  const limpio = sinEnlaces.replace(TELEFONO, (trozo: string, posicion: number) => {
    if (esPrecio(trozo, sinEnlaces.slice(0, posicion))) return trozo;
    oculto = true;
    return OCULTO;
  });
  return { texto: limpio, oculto };
}

export function mensajesDe(db: BaseDeDatos, ofertaId: string): Mensaje[] {
  return (db.mensajes ?? []).filter((m) => m.ofertaId === ofertaId);
}

// Cuántos mensajes hay en el chat de una oferta y cuántos le faltan leer a ese lado (los que mandó el otro).
export function resumenDeChat(db: BaseDeDatos, oferta: Oferta, lado: Lado): { mensajes: number; sinLeer: number } {
  const todos = mensajesDe(db, oferta.id);
  const leido = (lado === "vecino" ? oferta.leidoVecino : oferta.leidoPrestador) ?? "";
  return { mensajes: todos.length, sinLeer: todos.filter((m) => m.de !== lado && m.creado > leido).length };
}

// Por qué no se puede escribir en el chat de esa oferta, o "" si se puede.
// Con los de muestra no hay nadie del otro lado; con un presupuesto descartado queda solo para leer.
export function motivoDeCierre(db: BaseDeDatos, oferta: Oferta): "" | "muestra" | "descartada" {
  const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
  const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
  if (oferta.ejemplo || !pedido || pedido.ejemplo || !prestador || prestador.ejemplo) return "muestra";
  if (oferta.estado === "descartada") return "descartada";
  return "";
}
