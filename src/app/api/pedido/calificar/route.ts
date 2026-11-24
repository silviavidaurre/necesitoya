import { modificar } from "@/lib/db";
import { seguimientoDe } from "@/lib/seguimiento";

class ErrorDeCalificacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// El vecino califica al prestador que eligió. Una sola vez por pedido.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  const estrellas = Math.round(Number(cuerpo?.estrellas));
  const comentario = typeof cuerpo?.comentario === "string" ? cuerpo.comentario.trim().slice(0, 300) : "";

  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });
  if (!Number.isFinite(estrellas) || estrellas < 1 || estrellas > 5) {
    return Response.json({ error: "Elegí de 1 a 5 estrellas." }, { status: 400 });
  }

  try {
    const seguimiento = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeCalificacion("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeCalificacion("Este pedido no es tuyo.", 403);
      if (!db.ofertas.some((o) => o.pedidoId === id && o.estado === "elegida")) {
        throw new ErrorDeCalificacion("Primero elegí un presupuesto.", 409);
      }
      if (pedido.calificacion) throw new ErrorDeCalificacion("Ya calificaste este trabajo.", 409);

      pedido.calificacion = { estrellas, comentario, creado: new Date().toISOString() };
      return seguimientoDe(db, pedido);
    });
    return Response.json(seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeCalificacion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
