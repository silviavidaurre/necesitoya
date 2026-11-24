import { leer } from "@/lib/db";
import { estadoDeConexion, mercadoPagoDisponible, urlDeAutorizacion } from "@/lib/mercadopago";

// El prestador pide conectar su cuenta de Mercado Pago. Entra con su id secreto (en el cuerpo, nunca en la dirección)
// y recibe la página de Mercado Pago donde autoriza a NecesitoYa a cobrar en su nombre.
export async function POST(request: Request) {
  if (!mercadoPagoDisponible()) return Response.json({ error: "Mercado Pago todavía no está disponible." }, { status: 503 });
  const cuerpo = await request.json().catch(() => null);
  const prestador = (await leer()).prestadores.find((p) => p.id === cuerpo?.prestadorId && !p.ejemplo);
  if (!prestador) return Response.json({ error: "No encontramos tu perfil." }, { status: 404 });
  const vuelta = `${new URL(request.url).origin}/api/mercadopago/vuelta`;
  return Response.json({ url: urlDeAutorizacion(await estadoDeConexion(prestador.idPublico), vuelta) });
}
