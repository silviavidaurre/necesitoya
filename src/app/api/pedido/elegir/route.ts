import { modificar } from "@/lib/db";
import { seguimientoDe } from "@/lib/seguimiento";

class ErrorDeEleccion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// El vecino elige un presupuesto: ese queda elegido, los demás descartados y el pedido se cierra.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  if (!id || !clave || !ofertaId) return Response.json({ error: "Faltan datos." }, { status: 400 });

  try {
    const seguimiento = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeEleccion("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeEleccion("Este pedido no es tuyo.", 403);
      if (pedido.estado !== "abierto") throw new ErrorDeEleccion("Ya elegiste un presupuesto para este pedido.", 409);

      const delPedido = db.ofertas.filter((o) => o.pedidoId === id);
      if (!delPedido.some((o) => o.id === ofertaId)) throw new ErrorDeEleccion("Ese presupuesto ya no está disponible.", 404);

      for (const oferta of delPedido) oferta.estado = oferta.id === ofertaId ? "elegida" : "descartada";
      pedido.estado = "cerrado";
      return seguimientoDe(db, pedido);
    });
    return Response.json(seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeEleccion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
