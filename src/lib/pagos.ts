import { variable } from "./config";
import { cosmosDisponible, modoDeCosmos, usdc } from "@/integraciones/cosmos-pagos/cosmos";
import { mercadoPagoDisponible } from "@/integraciones/mercadopago-pagos/mercadopago";
import type { BaseDeDatos, EstadoDePago, Pago, PagoPublico, Prestador } from "./tipos";

// Hay algún medio de pago configurado en el servidor.
export function pagosDisponibles() {
  return cosmosDisponible() || mercadoPagoDisponible();
}

// A este prestador se le puede pagar por la app: con Cosmos (cargó su billetera) o con Mercado Pago (conectó su cuenta).
export function cobraPorLaApp(prestador: Pick<Prestador, "billetera" | "mercadopago" | "ejemplo">) {
  if (prestador.ejemplo) return false;
  return (cosmosDisponible() && Boolean(prestador.billetera)) || (mercadoPagoDisponible() && Boolean(prestador.mercadopago));
}

// El pago a este prestador queda retenido hasta confirmar: solo con Cosmos en modo protegido.
export function pagoProtegidoPara(prestador: Pick<Prestador, "billetera" | "ejemplo">) {
  return !prestador.ejemplo && cosmosDisponible() && Boolean(prestador.billetera) && modoDeCosmos() === "protegido";
}

// Reglas de los pagos dentro de la app, sin importar el proveedor.

// Comisión fija de NecesitoYa por trabajo pagado por la app, en USDC. La paga el vecino, aparte del trabajo.
// Propuesta: 1 USDC (unos $1.500): chica al lado de un trabajo típico ($25.000 a $150.000). Se cambia con COMISION_USDC.
export const COMISION_USDC = 1;

export function comisionUsdc() {
  const valor = Number(variable("COMISION_USDC") ?? COMISION_USDC);
  return usdc(Number.isFinite(valor) && valor > 0 ? valor : COMISION_USDC);
}

// Comisión fija en pesos para Mercado Pago (cuando esté configurado). Se cambia con COMISION_ARS.
export const COMISION_ARS = 1500;

export function comisionArs() {
  const valor = Number(variable("COMISION_ARS") ?? COMISION_ARS);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : COMISION_ARS;
}

// Cuántos pesos vale un USDC. Primero el ajuste ARS_POR_USDC; si no está, el dólar cripto del día; si eso falla, 1500.
export async function cotizacionArsPorUsdc(): Promise<number> {
  const fija = Number(variable("ARS_POR_USDC"));
  if (Number.isFinite(fija) && fija > 0) return fija;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 5_000);
  try {
    const respuesta = await fetch("https://dolarapi.com/v1/dolares/cripto", { signal: corte.signal });
    const datos = (await respuesta.json()) as { venta?: unknown };
    const venta = Number(datos.venta);
    if (respuesta.ok && Number.isFinite(venta) && venta > 100) return venta;
  } catch {
    // Sin cotización del día se usa la de respaldo.
  } finally {
    clearTimeout(reloj);
  }
  return 1500;
}

// El pago vigente de una oferta: el último que no se canceló ni venció.
export function pagoDe(db: BaseDeDatos, ofertaId: string): Pago | undefined {
  const delTrabajo = (db.pagos ?? []).filter((p) => p.ofertaId === ofertaId).sort((a, b) => b.creado.localeCompare(a.creado));
  return delTrabajo.find((p) => p.estado !== "cancelado" && p.estado !== "vencido");
}

export function pagoPublico(pago: Pago | undefined | null): PagoPublico | null {
  if (!pago) return null;
  return {
    proveedor: pago.proveedor,
    modo: pago.modo,
    estado: pago.estado,
    monto: pago.monto,
    moneda: pago.moneda,
    montoArs: pago.montoArs,
    comision: pago.comision,
    comisionPagada: pago.comisionPagada,
    urlDePago: pago.urlDePago,
    urlDeComision: pago.urlDeComision,
  };
}

// Estados de un pago protegido de Cosmos, llevados a los de la app.
export function estadoProtegido(status: string): EstadoDePago {
  switch (status) {
    case "FUNDED":
    case "SHIPPED":
    case "APPROVED":
      return "retenido";
    case "RELEASED":
      return "liberado";
    case "DISPUTED":
      return "en_disputa";
    case "RESOLVED":
      return "resuelto";
    case "EXPIRED":
      return "vencido";
    case "CANCELLED":
      return "cancelado";
    default:
      return "pendiente";
  }
}

// Estados de un cobro común (payment intent). EXPIRED no es final: un pago verificado tarde lo pasa a SUCCEEDED.
export function estadoDeCobro(status: string): EstadoDePago {
  if (status === "SUCCEEDED") return "pagado";
  if (status === "FAILED" || status === "CANCELLED") return "cancelado";
  return "pendiente";
}

// Un trabajo "cobrado por la app": la plata le llegó al prestador por NecesitoYa.
export function cobradoPorLaApp(pago: Pago | undefined) {
  return pago?.estado === "liberado" || pago?.estado === "pagado" || pago?.estado === "resuelto";
}

// Anota un cambio de estado (si cambió) con su fecha. Devuelve true si cambió algo.
export function anotarEstado(pago: Pago, estado: EstadoDePago, tipo: string) {
  if (pago.estado === estado) return false;
  // Un pago liberado o resuelto no vuelve atrás por un aviso viejo que llega tarde.
  if ((pago.estado === "liberado" || pago.estado === "resuelto" || pago.estado === "pagado") && estado !== "en_disputa") return false;
  // Una vez que la plata entró al contrato no vuelve a "esperando el pago".
  if (pago.estado !== "pendiente" && estado === "pendiente") return false;
  const ahora = new Date().toISOString();
  pago.estado = estado;
  pago.actualizado = ahora;
  pago.eventos = [...pago.eventos, { tipo, creado: ahora }].slice(-20);
  return true;
}

export const TEXTO_DE_ESTADO: Record<EstadoDePago, string> = {
  pendiente: "Esperando el pago",
  retenido: "Pago retenido hasta que confirmes",
  liberado: "Pago liberado",
  en_disputa: "Pago en reclamo",
  resuelto: "Reclamo resuelto",
  vencido: "El pago venció",
  cancelado: "Pago cancelado",
  pagado: "Pagado",
};
