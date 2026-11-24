import { sondearProtegidos } from "@/integraciones/cosmos-pagos/cosmos";
import { leer } from "@/lib/db";
import { seguimientoDe } from "@/lib/seguimiento";

// Seguimiento de un pedido para el vecino que lo hizo. Pide el id y la clave que recibió al publicarlo.
export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const id = parametros.get("id");
  const clave = parametros.get("clave");
  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });

  // Para que la pantalla diga bien si el pago queda protegido (queda guardado media hora).
  await sondearProtegidos();
  const db = await leer();
  const pedido = db.pedidos.find((p) => p.id === id);
  if (!pedido) return Response.json({ error: "No encontramos ese pedido." }, { status: 404 });
  if (!pedido.claveCliente || pedido.claveCliente !== clave) {
    return Response.json({ error: "Este pedido no es tuyo." }, { status: 403 });
  }

  return Response.json(seguimientoDe(db, pedido));
}
