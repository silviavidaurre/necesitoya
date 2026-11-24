import { avisar } from "@/lib/avisos";
import { cancelarPagoProtegido, cosmosDisponible } from "@/lib/cosmos";
import { modificar } from "@/lib/db";
import { anotarEstado, pagoDe } from "@/lib/pagos";
import { seguimientoDe } from "@/lib/seguimiento";
import { limpiarTexto } from "@/lib/texto";
import { trabajoDe } from "@/lib/trabajo";
import { sePuedeCancelar } from "@/lib/turnos";

class ErrorDeCancelacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// El vecino da de baja su pedido. Se puede mientras el trabajo no esté terminado y no haya plata retenida:
// con un pago protegido ya hecho, lo que corresponde es un reclamo (así la plata vuelve por la disputa de Cosmos).
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  const motivo = limpiarTexto(cuerpo?.motivo, 200) || "Sin motivo";
  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });

  try {
    const resultado = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeCancelacion("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeCancelacion("Este pedido no es tuyo.", 403);
      if (pedido.estado === "cancelado") return { seguimiento: seguimientoDe(db, pedido), aviso: null, pagoAnular: null };
      if (pedido.confirmado) throw new ErrorDeCancelacion("El trabajo ya está terminado: no se puede cancelar.", 409);
      const elegida = db.ofertas.find((o) => o.pedidoId === id && o.estado === "elegida");
      const pago = elegida ? pagoDe(db, elegida.id) : undefined;
      const trabajo = elegida ? trabajoDe(elegida) : null;
      if (trabajo && !sePuedeCancelar(trabajo.estado)) {
        throw new ErrorDeCancelacion("El prestador ya llegó: no se puede cancelar. Si algo salió mal, abrí un reclamo.", 409);
      }
      if (pago && pago.estado !== "pendiente") {
        throw new ErrorDeCancelacion("Ya pagaste por la app. Si algo salió mal, abrí un reclamo y la plata se resuelve por ahí.", 409);
      }
      pedido.estado = "cancelado";
      pedido.cancelacion = { creado: new Date().toISOString(), motivo };
      // Cancelado: la dirección se borra.
      pedido.direccion = null;
      // Los presupuestos que esperaban respuesta quedan descartados.
      for (const oferta of db.ofertas.filter((o) => o.pedidoId === id && o.estado === "enviada")) oferta.estado = "descartada";
      if (pago) anotarEstado(pago, "cancelado", "cancelado por el vecino");
      const prestador = elegida ? db.prestadores.find((p) => p.id === elegida.prestadorId) : undefined;
      return {
        seguimiento: seguimientoDe(db, pedido),
        aviso: prestador ? { cuenta: prestador.cuenta, titulo: pedido.titulo } : null,
        pagoAnular: pago && pago.proveedor === "cosmos" && pago.modo === "protegido" ? pago.externoId : null,
      };
    });
    if (resultado.aviso) {
      avisar(resultado.aviso.cuenta, { tipo: "reclamo", titulo: "Cancelaron un trabajo", texto: `El vecino canceló "${resultado.aviso.titulo}".`, url: "/prestador/ofertas" });
    }
    // El pago protegido sin fondos se anula también en Cosmos. Si falla, vence solo a las 48 horas.
    if (resultado.pagoAnular && cosmosDisponible()) await cancelarPagoProtegido(resultado.pagoAnular).catch(() => null);
    return Response.json(resultado.seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeCancelacion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
