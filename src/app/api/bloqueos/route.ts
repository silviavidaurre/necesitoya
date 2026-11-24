import { cuentaDe, leer, modificar } from "@/lib/db";

// Bloquear desde una conversación: el vecino bloquea al prestador, o el prestador bloquea al vecino.
// Con un bloqueo no se ven más los pedidos ni los presupuestos del otro y el chat queda cerrado.
// El vecino entra con su pedido y su clave; el prestador, con su id secreto. Hace falta tener cuenta.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  const db = await leer();
  const oferta = db.ofertas.find((o) => o.id === ofertaId);
  if (!oferta) return Response.json({ error: "No encontramos esa conversación." }, { status: 404 });
  const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
  const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);

  let cuenta: string | undefined;
  let bloqueo: string | undefined;
  if (typeof cuerpo?.prestadorId === "string" && cuerpo.prestadorId === oferta.prestadorId) {
    cuenta = prestador?.cuenta;
    bloqueo = pedido?.cuenta ? `c:${pedido.cuenta}` : undefined;
  } else if (pedido && cuerpo?.pedidoId === pedido.id && pedido.claveCliente && cuerpo?.clave === pedido.claveCliente) {
    cuenta = pedido.cuenta ?? cuentaDe(db, cuerpo?.cuenta);
    bloqueo = prestador ? `p:${prestador.id}` : undefined;
  } else {
    return Response.json({ error: "Esta conversación no es tuya." }, { status: 403 });
  }
  if (!cuenta) return Response.json({ error: "Entrá con tu cuenta para bloquear." }, { status: 401 });
  if (!bloqueo || prestador?.ejemplo) return Response.json({ error: "No se puede bloquear esta conversación." }, { status: 409 });

  const deshacer = cuerpo?.deshacer === true;
  await modificar((actual) => {
    const mia = actual.cuentas?.find((c) => c.sub === cuenta);
    if (!mia) return;
    const lista = new Set(mia.bloqueos ?? []);
    if (deshacer) lista.delete(bloqueo);
    else lista.add(bloqueo);
    mia.bloqueos = [...lista].slice(-500);
  });
  return Response.json({ bloqueado: !deshacer });
}
