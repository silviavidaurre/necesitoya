import { modificar } from "@/lib/db";
import { seguimientoDe } from "@/lib/seguimiento";

class ErrorDeConfirmacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// El vecino confirma que el trabajo quedó bien. Recién ahí puede calificar y, si pagó protegido, liberar el pago.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });

  try {
    const seguimiento = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeConfirmacion("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeConfirmacion("Este pedido no es tuyo.", 403);
      const elegida = db.ofertas.find((o) => o.pedidoId === id && o.estado === "elegida");
      if (!elegida) throw new ErrorDeConfirmacion("Primero elegí un presupuesto.", 409);
      // Con los de muestra no hay nadie que marque el trabajo como terminado: se puede confirmar para probar.
      if (!elegida.terminado && !elegida.ejemplo) throw new ErrorDeConfirmacion("Todavía no marcó el trabajo como terminado.", 409);
      if (!pedido.confirmado) pedido.confirmado = new Date().toISOString();
      return seguimientoDe(db, pedido);
    });
    return Response.json(seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeConfirmacion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
