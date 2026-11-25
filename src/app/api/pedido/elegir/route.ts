import { avisar } from "@/lib/avisos";
import { modificar } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";
import { limpiarTurnos, mismoTurno, textoDeTurno, turnoVigente } from "@/lib/turnos";
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
  // El día y la franja (entre los que ofreció el prestador) y la dirección, que es privada.
  const turno = limpiarTurnos(cuerpo?.turno ? [cuerpo.turno] : [])[0] ?? null;
  const calle = limpiarTexto(cuerpo?.direccion?.calle, 120);
  const referencia = limpiarTexto(cuerpo?.direccion?.referencia, 120);

  try {
    const resultado = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeEleccion("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeEleccion("Este pedido no es tuyo.", 403);
      if (pedido.estado !== "abierto") throw new ErrorDeEleccion("Ya elegiste un presupuesto para este pedido.", 409);

      const delPedido = db.ofertas.filter((o) => o.pedidoId === id);
      if (!delPedido.some((o) => o.id === ofertaId)) throw new ErrorDeEleccion("Ese presupuesto ya no está disponible.", 404);

      const elegidaAhora = delPedido.find((o) => o.id === ofertaId);
      const deMuestra = Boolean(elegidaAhora?.ejemplo);
      if (!deMuestra && calle.length < 4) throw new ErrorDeEleccion("Escribí la dirección: calle y número.", 400);
      // Si a todos los turnos que ofreció ya se les pasó la hora, se lo puede elegir igual y el día se coordina por
      // el chat (antes quedaba trabado: ningún turno servía y no se lo podía elegir).
      const vigentes = (elegidaAhora?.turnos ?? []).filter((t) => turnoVigente(t));
      if (!deMuestra && vigentes.length > 0) {
        if (!turno || !vigentes.some((t) => mismoTurno(t, turno))) throw new ErrorDeEleccion("Elegí uno de los días y horarios que ofreció.", 400);
      }

      for (const oferta of delPedido) oferta.estado = oferta.id === ofertaId ? "elegida" : "descartada";
      pedido.estado = "cerrado";
      if (elegidaAhora) {
        elegidaAhora.trabajo = { estado: "confirmado", turno, historial: [{ estado: "confirmado", creado: new Date().toISOString() }] };
        if (turno) elegidaAhora.cuando = textoDeTurno(turno);
      }
      if (calle) pedido.direccion = { calle, referencia };
      const elegido = db.prestadores.find((p) => p.id === delPedido.find((o) => o.id === ofertaId)?.prestadorId);
      return { seguimiento: seguimientoDe(db, pedido), cuenta: elegido?.cuenta, titulo: pedido.titulo };
    });
    avisar(resultado.cuenta, { tipo: "elegido", titulo: "Te eligieron", texto: `Para "${resultado.titulo}". Escribile al vecino para coordinar.`, url: "/prestador/ofertas" });
    return Response.json(resultado.seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeEleccion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
