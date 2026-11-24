import { modificar } from "@/lib/db";
import { ErrorDeMercadoPago, conectarVendedor, leerEstadoDeConexion, mercadoPagoDisponible } from "@/integraciones/mercadopago-pagos/mercadopago";

// Mercado Pago vuelve acá después de que el prestador autoriza. Se guardan sus credenciales (privadas) y se lo
// devuelve a su perfil con el resultado.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const destino = (resultado: string) => Response.redirect(`${url.origin}/prestador/perfil?mercadopago=${resultado}`, 302);
  if (!mercadoPagoDisponible()) return destino("no-disponible");
  const codigo = url.searchParams.get("code") ?? "";
  const idPublico = await leerEstadoDeConexion(url.searchParams.get("state") ?? "");
  if (!codigo || !idPublico) return destino("error");
  try {
    const cuenta = await conectarVendedor(codigo, `${url.origin}/api/mercadopago/vuelta`);
    const hecho = await modificar((db) => {
      const prestador = db.prestadores.find((p) => p.idPublico === idPublico);
      if (!prestador) return false;
      prestador.mercadopago = cuenta;
      return true;
    });
    return destino(hecho ? "listo" : "error");
  } catch (error) {
    if (error instanceof ErrorDeMercadoPago) return destino("error");
    throw error;
  }
}
