import { MAX_OFERTAS } from "./catalogo";
import { resumenDeChat } from "./chat";
import { pedidoPublico } from "./db";
import { cosmosDisponible } from "./cosmos";
import { pagoDe, pagoPublico } from "./pagos";
import { reputacionDe } from "./reglas";
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
      if (!prestador) return [];
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
            cobraPorLaApp: Boolean(prestador.billetera),
          },
          pago: pagoPublico(pagoDe(db, oferta.id)),
        },
      ];
    });

  return { pedido: pedidoPublico(pedido), ofertas, maximo: MAX_OFERTAS, pagos: cosmosDisponible() };
}

export type Seguimiento = ReturnType<typeof seguimientoDe>;
