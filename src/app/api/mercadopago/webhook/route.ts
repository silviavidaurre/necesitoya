import { avisar } from "@/lib/avisos";
import { leer, modificar } from "@/lib/db";
import { estadoDeMercadoPago, leerPagoDeMercadoPago, notificacionValida } from "@/integraciones/mercadopago-pagos/mercadopago";
import { anotarEstado } from "@/lib/pagos";

// Notificaciones de Mercado Pago. Se acepta solo con la firma correcta; después se lee el pago real con el token
// del prestador (el de la oferta que viene en la dirección) y recién ahí se marca. Responde 200 para no recibir reintentos.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const cuerpo = await request.json().catch(() => null);
  const idDelPago = String(cuerpo?.data?.id ?? url.searchParams.get("data.id") ?? "");
  const tipo = String(cuerpo?.type ?? url.searchParams.get("type") ?? "");
  const ofertaId = url.searchParams.get("oferta") ?? "";
  if (!idDelPago || tipo !== "payment" || !ofertaId) return Response.json({ recibido: true });
  if (!(await notificacionValida(request, idDelPago))) return Response.json({ error: "Firma inválida." }, { status: 400 });

  const db = await leer();
  const oferta = db.ofertas.find((o) => o.id === ofertaId);
  const prestador = db.prestadores.find((p) => p.id === oferta?.prestadorId);
  if (!oferta || !prestador?.mercadopago) return Response.json({ recibido: true });

  const pagoReal = await leerPagoDeMercadoPago(idDelPago, prestador.mercadopago.token).catch(() => null);
  if (!pagoReal || pagoReal.external_reference !== ofertaId) return Response.json({ recibido: true });
  const estado = estadoDeMercadoPago(pagoReal.status);

  const cambio = await modificar((actual) => {
    const pago = (actual.pagos ?? []).find((p) => p.ofertaId === ofertaId && p.proveedor === "mercadopago" && p.estado !== "cancelado");
    if (!pago) return false;
    const cambiado = anotarEstado(pago, estado, `mercadopago:${pagoReal.status}`);
    if (estado === "pagado") pago.comisionPagada = true;
    return cambiado;
  });
  if (cambio && estado === "pagado") {
    avisar(prestador.cuenta, { tipo: "pago", titulo: "Te pagaron por Mercado Pago", texto: "El pago ya está en tu cuenta.", url: "/prestador/ofertas" });
  }
  return Response.json({ recibido: true });
}
