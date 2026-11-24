import { MAX_OFERTAS } from "./catalogo";
import { resumenDeChat } from "./chat";
import { pedidoPublico } from "./db";
import { cobraPorLaApp, pagoDe, pagoProtegidoPara, pagoPublico, pagosDisponibles } from "./pagos";
import { bloqueados } from "./moderacion";
import { reputacionDe } from "./reglas";
import { trabajoDe } from "./trabajo";
import type { BaseDeDatos, OfertaParaCliente, Pedido } from "./tipos";

// Arma lo que ve el vecino dueño de un pedido: el pedido y los presupuestos que recibió.
// Nunca sale el teléfono del prestador ni su id secreto: el vecino recibe únicamente el id público
// y le escribe por el chat de la app. Cada presupuesto dice cuántos mensajes tiene sin leer.
export function seguimientoDe(db: BaseDeDatos, pedido: Pedido) {
  const ofertas: OfertaParaCliente[] = db.ofertas
    .filter((o) => o.pedidoId === pedido.id)
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .flatMap((oferta) => {
      const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
      // Un prestador bloqueado (o que bloqueó) no aparece, salvo que ya sea el elegido: ese trabajo queda a la vista.
      if (!prestador || (oferta.estado !== "elegida" && bloqueados(db, pedido, prestador))) return [];
      const { prestadorId: _secreto, leidoVecino: _vecino, leidoPrestador: _prestador, ...visible } = oferta;
      return [
        {
          ...visible,
          ...resumenDeChat(db, oferta, "vecino"),
          prestador: {
            id: prestador.idPublico,
            nombre: prestador.nombre,
            rubros: prestador.rubros,
            aniosExperiencia: prestador.aniosExperiencia,
            descripcion: prestador.descripcion,
            nivel: prestador.nivel,
            fotos: prestador.fotos ?? [],
            reputacion: reputacionDe(db, prestador.id),
            ejemplo: Boolean(prestador.ejemplo),
            demo: Boolean(prestador.demo),
            cobraPorLaApp: cobraPorLaApp(prestador),
            pagoProtegido: pagoProtegidoPara(prestador),
          },
          pago: pagoPublico(pagoDe(db, oferta.id)),
          trabajo: trabajoDe(oferta),
        },
      ];
    });

  // Los reclamos del trabajo elegido: qué se reclamó y cómo se resolvió (sin las fotos).
  const reclamos = (db.reclamos ?? [])
    .filter((r) => r.pedidoId === pedido.id)
    .map((r) => ({ de: r.de, motivo: r.motivo, estado: r.estado, resolucion: r.resolucion ?? "", creado: r.creado }));
  // La dirección es del vecino: se la devolvemos solo a él (esta vista es la del dueño del pedido).
  return { pedido: pedidoPublico(pedido), direccion: pedido.direccion ?? null, ofertas, maximo: MAX_OFERTAS, pagos: pagosDisponibles(), reclamos };
}

export type Seguimiento = ReturnType<typeof seguimientoDe>;
