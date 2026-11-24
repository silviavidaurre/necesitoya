import { MAX_OFERTAS } from "@/lib/catalogo";
import { resumenDeChat } from "@/lib/chat";
import { dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { avisar } from "@/lib/avisos";
import { pagoDe, pagoPublico } from "@/lib/pagos";
import { bloqueados } from "@/lib/moderacion";
import { cubreZona, minutosDeReserva } from "@/lib/reglas";
import { limpiarTexto } from "@/lib/texto";
import type { Oferta } from "@/lib/tipos";


class ErrorDeOferta extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// Ofertas de un prestador, con los datos del pedido para mostrarlas en "Mis presupuestos".
// Del vecino solo sale el nombre de pila: se le escribe por el chat de la app, nunca se muestra su teléfono.
export async function GET(request: Request) {
  const prestadorId = new URL(request.url).searchParams.get("prestadorId");
  if (!prestadorId) return Response.json({ error: "Falta el prestador." }, { status: 400 });

  const db = await leer();
  const ofertas = db.ofertas
    .filter((o) => o.prestadorId === prestadorId)
    .sort((a, b) => b.creado.localeCompare(a.creado))
    .map((oferta) => {
      const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
      const { leidoVecino: _vecino, leidoPrestador: _prestador, ...visible } = oferta;
      return {
        ...visible,
        pedido: pedido
          ? { titulo: pedido.titulo, zona: pedido.zona, rubro: pedido.rubro, ejemplo: pedido.ejemplo, estado: pedido.estado, confirmado: pedido.confirmado ?? null, calificacion: pedido.calificacion ?? null }
          : null,
        pago: pagoPublico(pagoDe(db, oferta.id)),
        reclamos: (db.reclamos ?? []).filter((r) => r.ofertaId === oferta.id).map((r) => ({ de: r.de, motivo: r.motivo, estado: r.estado, resolucion: r.resolucion ?? "" })),
        cliente: pedido ? { nombre: pedido.clienteNombre.split(" ")[0] } : null,
        // Mensajes del chat con el vecino: cuántos hay y cuántos le faltan leer al prestador.
        ...resumenDeChat(db, oferta, "prestador"),
      };
    });

  return Response.json({ ofertas });
}

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const pedidoId = typeof cuerpo?.pedidoId === "string" ? cuerpo.pedidoId : "";
  const prestadorId = typeof cuerpo?.prestadorId === "string" ? cuerpo.prestadorId : "";
  const precio = Number(cuerpo?.precio);
  const cuando = limpiarTexto(cuerpo?.cuando, 80);
  const mensaje = limpiarTexto(cuerpo?.mensaje, 500);

  if (!pedidoId || !prestadorId) return Response.json({ error: "Faltan datos de la oferta." }, { status: 400 });
  if (!Number.isFinite(precio) || precio < 1000 || precio > 50_000_000) {
    return Response.json({ error: "Escribí el precio de la mano de obra en pesos." }, { status: 400 });
  }
  if (!cuando) return Response.json({ error: "Decinos cuándo podés ir." }, { status: 400 });
  // Para presupuestar hace falta que el perfil esté unido a una cuenta.
  const quien = (await leer()).prestadores.find((p) => p.id === prestadorId);
  if (quien && !quien.cuenta) return Response.json({ error: "Entrá con tu cuenta para mandar presupuestos." }, { status: 401 });
  if (quien?.suspendido) return Response.json({ error: "Tu perfil está en revisión. Escribinos para reactivarlo." }, { status: 403 });
  if (!(await dentroDelCupo("ofertas")) || !(await dentroDelCupoDe("ofertas", quien?.cuenta))) {
    return Response.json({ error: "Hoy se enviaron demasiados presupuestos. Probá de nuevo mañana." }, { status: 429 });
  }

  try {
    const resultado = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === pedidoId);
      if (!pedido || pedido.estado !== "abierto") throw new ErrorDeOferta("Ese pedido ya no está disponible.", 404);
      const prestador = db.prestadores.find((p) => p.id === prestadorId);
      if (!prestador) throw new ErrorDeOferta("No encontramos tu perfil.", 404);
      if (bloqueados(db, pedido, prestador)) throw new ErrorDeOferta("Ese pedido ya no está disponible.", 404);

      const delPedido = db.ofertas.filter((o) => o.pedidoId === pedidoId);
      if (delPedido.some((o) => o.prestadorId === prestadorId)) {
        throw new ErrorDeOferta("Ya enviaste un presupuesto para este pedido.", 409);
      }
      // Los presupuestos de muestra no ocupan lugar: un prestador real siempre puede entrar.
      const reales = delPedido.filter((o) => !o.ejemplo);
      // Los pedidos de ejemplo son para practicar: no tienen tope, así no se "gastan" con las pruebas.
      if (!pedido.ejemplo && reales.length >= MAX_OFERTAS) {
        throw new ErrorDeOferta("Este pedido ya recibió todos los presupuestos que admite.", 409);
      }
      // El último lugar queda guardado un rato para quienes trabajan en ese barrio.
      const reserva = cubreZona(prestador, pedido.zona) ? 0 : minutosDeReserva(pedido, reales.length);
      if (reserva > 0) {
        throw new ErrorDeOferta(
          `El último lugar está guardado para prestadores de ${pedido.zona}. Se abre para todos en ${reserva} min.`,
          409,
        );
      }

      const oferta: Oferta = {
        id: nuevoId(),
        pedidoId,
        prestadorId,
        precio: Math.round(precio),
        cuando,
        mensaje,
        estado: "enviada",
        creado: new Date().toISOString(),
      };
      db.ofertas.push(oferta);
      return { oferta, posicion: reales.length + 1, aviso: { cuenta: pedido.cuenta, pedidoId: pedido.id, quien: prestador.nombre.split(" ")[0] } };
    });

    const { aviso, ...respuesta } = resultado;
    avisar(aviso.cuenta, { tipo: "presupuesto", titulo: "Llegó un presupuesto", texto: `${aviso.quien} te pasó su precio. Entrá a compararlo.`, url: `/pedido/${aviso.pedidoId}` });
    return Response.json({ ...respuesta, maximo: MAX_OFERTAS }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorDeOferta) {
      return Response.json({ error: error.message }, { status: error.estado });
    }
    throw error;
  }
}
