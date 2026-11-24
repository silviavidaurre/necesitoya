import { avisar } from "@/lib/avisos";
import { modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";
import type { Mensaje } from "@/lib/tipos";

class ErrorDeDia extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// Cambiar el día de un trabajo elegido. Lo puede hacer cualquiera de los dos; queda escrito en el chat.
// El prestador entra con su id secreto; el vecino, con el id del pedido y su clave.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  const cuando = limpiarTexto(cuerpo?.cuando, 80);
  if (!ofertaId || !cuando) return Response.json({ error: "Decinos el nuevo día." }, { status: 400 });

  try {
    const resultado = await modificar((db) => {
      const oferta = db.ofertas.find((o) => o.id === ofertaId);
      if (!oferta) throw new ErrorDeDia("No encontramos ese trabajo.", 404);
      const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
      const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
      let lado: Mensaje["de"];
      if (typeof cuerpo?.prestadorId === "string" && cuerpo.prestadorId && cuerpo.prestadorId === oferta.prestadorId) lado = "prestador";
      else if (pedido && cuerpo?.pedidoId === pedido.id && pedido.claveCliente && cuerpo?.clave === pedido.claveCliente) lado = "vecino";
      else throw new ErrorDeDia("Este trabajo no es tuyo.", 403);
      if (oferta.estado !== "elegida" || !pedido || pedido.estado === "cancelado" || pedido.confirmado || oferta.terminado) {
        throw new ErrorDeDia("Solo se cambia el día de un trabajo elegido que todavía no terminó.", 409);
      }
      oferta.cuando = cuando;
      const creado = new Date().toISOString();
      db.mensajes = [...(db.mensajes ?? []), { id: nuevoId(), ofertaId, de: lado, texto: `Cambié el día del trabajo: ${cuando}.`, creado }];
      if (lado === "vecino") oferta.leidoVecino = creado;
      else oferta.leidoPrestador = creado;
      return { cuando, lado, pedido, prestador };
    });
    const texto = `Nuevo día: ${resultado.cuando}.`;
    if (resultado.lado === "vecino") avisar(resultado.prestador?.cuenta, { tipo: "mensaje", titulo: "Cambiaron el día", texto, url: "/prestador/ofertas" });
    else avisar(resultado.pedido.cuenta, { tipo: "mensaje", titulo: "Cambiaron el día", texto, url: `/pedido/${resultado.pedido.id}` });
    return Response.json({ cuando: resultado.cuando });
  } catch (error) {
    if (error instanceof ErrorDeDia) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
