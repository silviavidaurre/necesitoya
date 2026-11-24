import { avisar } from "@/lib/avisos";
import { variable } from "@/lib/config";
import { firmaValida } from "@/lib/cosmos";
import { modificar } from "@/lib/db";
import { anotarEstado, estadoDeCobro, estadoProtegido } from "@/lib/pagos";

// Cosmos Pay avisa acá cada cambio de un pago. Solo se acepta con la firma correcta (HMAC con el secreto del webhook).
// Responde 200 aunque el pago no sea nuestro, para que Cosmos no lo reintente para siempre.
export async function POST(request: Request) {
  const secreto = variable("COSMOS_WEBHOOK_SECRET");
  if (!secreto) return Response.json({ error: "Webhook sin configurar." }, { status: 503 });

  const crudo = await request.text();
  if (crudo.length > 100_000) return Response.json({ error: "Demasiado grande." }, { status: 413 });
  if (!(await firmaValida(crudo, request.headers.get("x-cosmos-signature"), secreto))) {
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }

  let evento: { id?: string; type?: string; data?: { id?: string; status?: string; reference?: string } };
  try {
    evento = JSON.parse(crudo);
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const tipo = String(evento.type ?? "");
  const externoId = String(evento.data?.id ?? "");
  const status = String(evento.data?.status ?? "");
  // Los pagos protegidos llevan nuestra referencia (el id de la oferta): sirve si el id de Cosmos todavía no estaba guardado.
  const referencia = tipo.startsWith("PROTECTED_PAYMENT_") ? String(evento.data?.reference ?? "") : "";
  if (!externoId || !status) return Response.json({ recibido: true });

  const resultado = await modificar((db) => {
    for (const pago of db.pagos ?? []) {
      if (pago.externoId === externoId || (referencia && pago.modo === "protegido" && pago.ofertaId === referencia && pago.estado !== "cancelado")) {
        const estado = tipo.startsWith("PROTECTED_PAYMENT_") ? estadoProtegido(status) : estadoDeCobro(status);
        const cambio = anotarEstado(pago, estado, tipo || "aviso");
        if (pago.modo === "directo" && estado === "pagado") pago.comisionPagada = true;
        if (!cambio) return null;
        const pedido = db.pedidos.find((p) => p.id === pago.pedidoId);
        const prestador = db.prestadores.find((p) => p.id === db.ofertas.find((o) => o.id === pago.ofertaId)?.prestadorId);
        return { estado, pedido, prestador };
      }
      if (pago.comisionId === externoId && estadoDeCobro(status) === "pagado" && !pago.comisionPagada) {
        pago.comisionPagada = true;
        pago.actualizado = new Date().toISOString();
        return null;
      }
    }
    return null;
  });

  if (resultado?.pedido) {
    const url = `/pedido/${resultado.pedido.id}`;
    if (resultado.estado === "retenido" || resultado.estado === "pagado") {
      avisar(resultado.prestador?.cuenta, { tipo: "pago", titulo: "Te pagaron por la app", texto: resultado.estado === "retenido" ? "La plata queda retenida hasta que el vecino confirme." : "El pago ya está en tu billetera.", url: "/prestador/ofertas" });
    } else if (resultado.estado === "liberado") {
      avisar(resultado.prestador?.cuenta, { tipo: "pago", titulo: "Se liberó tu pago", texto: `El vecino liberó el pago de "${resultado.pedido.titulo}".`, url: "/prestador/ofertas" });
    } else if (resultado.estado === "en_disputa" || resultado.estado === "resuelto") {
      const texto = resultado.estado === "en_disputa" ? "Hay un reclamo abierto sobre el pago." : "Se resolvió el reclamo del pago.";
      avisar(resultado.prestador?.cuenta, { tipo: "pago", titulo: "Novedades del pago", texto, url: "/prestador/ofertas" });
      avisar(resultado.pedido.cuenta, { tipo: "pago", titulo: "Novedades del pago", texto, url });
    }
  }
  return Response.json({ recibido: true });
}
