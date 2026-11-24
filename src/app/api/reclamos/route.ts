import { avisar } from "@/lib/avisos";
import { dentroDelCupo, dentroDelCupoDe, guardarFoto, leer, modificar, nuevoId } from "@/lib/db";
import { fotoValida } from "@/lib/fotos";
import { PREFIJO_PRIVADO } from "@/lib/moderacion";
import { MOTIVOS_DE_RECLAMO as MOTIVOS } from "@/lib/motivos";
import { pagoDe } from "@/lib/pagos";
import { limpiarTexto } from "@/lib/texto";
import type { BaseDeDatos, Reclamo } from "@/lib/tipos";

// Reclamos sobre un trabajo elegido. La prueba son las fotos que se adjuntan y el chat del presupuesto,
// que el equipo ve en el panel de moderación. Si el vecino pagó protegido, el reclamo se conecta con la disputa
// del pago: la respuesta trae la página de Cosmos donde el vecino abre la disputa con su billetera.


class ErrorDeReclamo extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

function quienEs(db: BaseDeDatos, cuerpo: Record<string, unknown> | null) {
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  const oferta = db.ofertas.find((o) => o.id === ofertaId);
  if (!oferta) throw new ErrorDeReclamo("No encontramos ese trabajo.", 404);
  const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
  if (typeof cuerpo?.prestadorId === "string" && cuerpo.prestadorId && cuerpo.prestadorId === oferta.prestadorId) return { oferta, pedido, de: "prestador" as const };
  if (pedido && cuerpo?.pedidoId === pedido.id && pedido.claveCliente && cuerpo?.clave === pedido.claveCliente) return { oferta, pedido, de: "vecino" as const };
  throw new ErrorDeReclamo("Este trabajo no es tuyo.", 403);
}

function vista(reclamo: Reclamo) {
  return { id: reclamo.id, de: reclamo.de, motivo: reclamo.motivo, detalle: reclamo.detalle, estado: reclamo.estado, resolucion: reclamo.resolucion ?? "", creado: reclamo.creado };
}

// Los reclamos de un trabajo, para cualquiera de las dos partes.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    const db = await leer();
    const { oferta } = quienEs(db, { ofertaId: p.get("ofertaId"), prestadorId: p.get("prestadorId"), pedidoId: p.get("pedidoId"), clave: p.get("clave") });
    return Response.json({ reclamos: (db.reclamos ?? []).filter((r) => r.ofertaId === oferta.id).map(vista) });
  } catch (error) {
    if (error instanceof ErrorDeReclamo) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const motivo = MOTIVOS.includes(String(cuerpo?.motivo)) ? String(cuerpo?.motivo) : "";
  const detalle = limpiarTexto(cuerpo?.detalle, 800);
  if (!motivo) return Response.json({ error: "Elegí qué pasó." }, { status: 400 });
  if (detalle.length < 10) return Response.json({ error: "Contá un poco más qué pasó." }, { status: 400 });

  let fotos;
  try {
    fotos = (Array.isArray(cuerpo?.fotos) ? cuerpo.fotos.slice(0, 3) : []).map((f) => fotoValida(f)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const db = await leer();
    const { oferta, pedido, de } = quienEs(db, cuerpo);
    if (oferta.estado !== "elegida") throw new ErrorDeReclamo("Solo se reclama por un trabajo elegido.", 409);
    if ((db.reclamos ?? []).some((r) => r.ofertaId === oferta.id && r.de === de && r.estado === "abierto")) {
      throw new ErrorDeReclamo("Ya tenés un reclamo abierto por este trabajo. Lo estamos revisando.", 409);
    }
    const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
    const miCuenta = de === "vecino" ? pedido?.cuenta : prestador?.cuenta;
    if (!(await dentroDelCupoDe("reclamos", miCuenta)) || (fotos.length > 0 && !(await dentroDelCupo("fotos")))) {
      throw new ErrorDeReclamo("Hiciste muchos reclamos hoy. Probá mañana.", 429);
    }

    const idsDeFotos: string[] = [];
    for (const foto of fotos) {
      const id = `${PREFIJO_PRIVADO}${nuevoId()}`;
      await guardarFoto(id, foto);
      idsDeFotos.push(id);
    }

    const reclamo = await modificar((actual) => {
      const nuevo: Reclamo = { id: nuevoId(), pedidoId: oferta.pedidoId, ofertaId: oferta.id, de, motivo, detalle, fotos: idsDeFotos, estado: "abierto", creado: new Date().toISOString() };
      actual.reclamos = [...(actual.reclamos ?? []), nuevo];
      return nuevo;
    });

    // Al otro lado se le avisa que hay un reclamo (sin el detalle).
    if (de === "vecino") avisar(prestador?.cuenta, { tipo: "reclamo", titulo: "Abrieron un reclamo", texto: `Por "${pedido?.titulo ?? "un trabajo"}". El equipo lo va a revisar.`, url: "/prestador/ofertas" });
    else avisar(pedido?.cuenta, { tipo: "reclamo", titulo: "Abrieron un reclamo", texto: `Por "${pedido?.titulo ?? "un trabajo"}". El equipo lo va a revisar.`, url: `/pedido/${oferta.pedidoId}` });

    // Con la plata retenida en Cosmos, el vecino abre la disputa del pago en la página de Cosmos (la firma su billetera).
    const pago = pagoDe(db, oferta.id);
    const disputa = de === "vecino" && pago?.proveedor === "cosmos" && pago.modo === "protegido" && pago.estado === "retenido" ? pago.urlDePago : null;
    return Response.json({ reclamo: vista(reclamo), disputa }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorDeReclamo) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
