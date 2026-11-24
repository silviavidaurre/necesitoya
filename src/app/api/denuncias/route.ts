import { cuentaDe, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { MOTIVOS_DE_DENUNCIA } from "@/lib/motivos";
import { limpiarTexto } from "@/lib/texto";
import type { Denuncia } from "@/lib/tipos";

// Denunciar un perfil (por su id público) o un mensaje del chat. Hace falta una cuenta: así una persona
// no puede tapar de denuncias a alguien sin dar la cara. El equipo las revisa en el panel de moderación.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const tipo = cuerpo?.tipo === "perfil" || cuerpo?.tipo === "mensaje" ? (cuerpo.tipo as Denuncia["tipo"]) : null;
  const objetivo = limpiarTexto(cuerpo?.objetivo, 64);
  const motivo = MOTIVOS_DE_DENUNCIA.includes(String(cuerpo?.motivo)) ? String(cuerpo?.motivo) : "";
  const detalle = limpiarTexto(cuerpo?.detalle, 600);
  if (!tipo || !objetivo) return Response.json({ error: "Faltan datos." }, { status: 400 });
  if (!motivo) return Response.json({ error: "Elegí el motivo." }, { status: 400 });

  const db = await leer();
  const cuenta = cuentaDe(db, cuerpo?.cuenta);
  if (!cuenta) return Response.json({ error: "Entrá con tu cuenta para denunciar." }, { status: 401 });

  let ofertaId: string | undefined;
  if (tipo === "perfil") {
    if (!db.prestadores.some((p) => p.idPublico === objetivo)) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
  } else {
    const mensaje = (db.mensajes ?? []).find((m) => m.id === objetivo);
    if (!mensaje) return Response.json({ error: "No encontramos ese mensaje." }, { status: 404 });
    // Solo denuncia un mensaje quien está en esa conversación.
    const oferta = db.ofertas.find((o) => o.id === mensaje.ofertaId);
    const pedido = db.pedidos.find((p) => p.id === oferta?.pedidoId);
    const prestador = db.prestadores.find((p) => p.id === oferta?.prestadorId);
    if (pedido?.cuenta !== cuenta && prestador?.cuenta !== cuenta) return Response.json({ error: "Esa conversación no es tuya." }, { status: 403 });
    ofertaId = oferta?.id;
  }
  if (!(await dentroDelCupoDe("denuncias", cuenta))) return Response.json({ error: "Hiciste muchas denuncias hoy. Probá mañana." }, { status: 429 });

  await modificar((actual) => {
    const repetida = (actual.denuncias ?? []).some((d) => d.cuenta === cuenta && d.objetivo === objetivo && d.estado === "abierta");
    if (repetida) return;
    const nueva: Denuncia = { id: nuevoId(), tipo, objetivo, ofertaId, motivo, detalle, cuenta, estado: "abierta", creado: new Date().toISOString() };
    actual.denuncias = [...(actual.denuncias ?? []), nueva];
  });
  return Response.json({ listo: true }, { status: 201 });
}
