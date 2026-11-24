import { variable } from "./config";

// Mercado Pago como marketplace: cada prestador conecta su cuenta de Mercado Pago (OAuth) y el vecino le paga
// directo en pesos; la comisión fija de NecesitoYa se separa sola con `marketplace_fee`. No queda retenido.
//
// Hace falta (como secretos del Worker o en .env.local):
//   MP_CLIENT_ID y MP_CLIENT_SECRET: de la aplicación de NecesitoYa en Mercado Pago Developers (modelo marketplace).
//   MP_WEBHOOK_SECRET: la clave secreta de las notificaciones (Webhooks) de esa aplicación.
// Sin eso, todo esto queda apagado y la app no muestra Mercado Pago.

const API = "https://api.mercadopago.com";

export class ErrorDeMercadoPago extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

export function mercadoPagoDisponible() {
  return Boolean(variable("MP_CLIENT_ID") && variable("MP_CLIENT_SECRET"));
}

function b64url(bytes: Uint8Array) {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
}

async function firmar(texto: string, secreto: string) {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(texto)));
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i++) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}

// El "state" de OAuth lleva el id PÚBLICO del prestador y un vencimiento, firmados: así nadie conecta una cuenta ajena.
export async function estadoDeConexion(idPublico: string) {
  const cuerpo = `${idPublico}.${Date.now() + 15 * 60_000}`;
  return `${cuerpo}.${b64url(await firmar(cuerpo, variable("MP_CLIENT_SECRET") ?? ""))}`;
}

export async function leerEstadoDeConexion(estado: string): Promise<string | null> {
  const partes = estado.split(".");
  if (partes.length !== 3) return null;
  const [idPublico, vence, firma] = partes;
  if (Number(vence) < Date.now()) return null;
  const esperada = b64url(await firmar(`${idPublico}.${vence}`, variable("MP_CLIENT_SECRET") ?? ""));
  return iguales(firma, esperada) ? idPublico : null;
}

export function urlDeAutorizacion(estado: string, vuelta: string) {
  const parametros = new URLSearchParams({ client_id: variable("MP_CLIENT_ID") ?? "", response_type: "code", platform_id: "mp", state: estado, redirect_uri: vuelta });
  return `https://auth.mercadopago.com.ar/authorization?${parametros.toString()}`;
}

async function llamar<T>(ruta: string, token: string | undefined, cuerpo?: unknown, metodo: "GET" | "POST" = cuerpo ? "POST" : "GET"): Promise<T> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 20_000);
  try {
    const respuesta = await fetch(API + ruta, {
      method: metodo,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: corte.signal,
    });
    const datos = (await respuesta.json().catch(() => null)) as T & { message?: string };
    if (!respuesta.ok) {
      console.error("[mercadopago]", metodo, ruta.replace(/[?].*$/, ""), respuesta.status, datos?.message ?? "");
      throw new ErrorDeMercadoPago("Mercado Pago rechazó el pedido.", respuesta.status);
    }
    return datos;
  } catch (error) {
    if (error instanceof ErrorDeMercadoPago) throw error;
    throw new ErrorDeMercadoPago("No pudimos conectar con Mercado Pago.", 502);
  } finally {
    clearTimeout(reloj);
  }
}

export interface CuentaDeMercadoPago {
  usuario: string;
  token: string;
  refresco: string;
  vence: string;
}

// Cambia el código que devuelve Mercado Pago por las credenciales del prestador (vendedor del marketplace).
export async function conectarVendedor(codigo: string, vuelta: string): Promise<CuentaDeMercadoPago> {
  const datos = await llamar<{ access_token: string; refresh_token: string; user_id: number; expires_in: number }>("/oauth/token", undefined, {
    client_id: variable("MP_CLIENT_ID"),
    client_secret: variable("MP_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code: codigo,
    redirect_uri: vuelta,
  });
  return { usuario: String(datos.user_id), token: datos.access_token, refresco: datos.refresh_token, vence: new Date(Date.now() + datos.expires_in * 1000).toISOString() };
}

// Arma el cobro en la cuenta del prestador, con la comisión fija de NecesitoYa separada (marketplace_fee).
export function crearPreferencia(datos: { token: string; titulo: string; precio: number; comision: number; referencia: string; notificacion: string; vuelta: string }) {
  return llamar<{ id: string; init_point: string }>("/checkout/preferences", datos.token, {
    items: [{ title: datos.titulo.slice(0, 120), quantity: 1, unit_price: datos.precio, currency_id: "ARS" }],
    marketplace_fee: datos.comision,
    external_reference: datos.referencia,
    notification_url: datos.notificacion,
    back_urls: { success: datos.vuelta, pending: datos.vuelta, failure: datos.vuelta },
    auto_return: "approved",
  });
}

export function leerPagoDeMercadoPago(id: string, token: string) {
  return llamar<{ id: number; status: string; external_reference: string }>(`/v1/payments/${encodeURIComponent(id)}`, token);
}

// Firma de las notificaciones: x-signature "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
export async function notificacionValida(request: Request, idDelPago: string) {
  const secreto = variable("MP_WEBHOOK_SECRET");
  const firma = request.headers.get("x-signature") ?? "";
  const pedidoId = request.headers.get("x-request-id") ?? "";
  if (!secreto || !firma) return false;
  const partes = Object.fromEntries(firma.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const plantilla = `id:${idDelPago.toLowerCase()};request-id:${pedidoId};ts:${partes.ts};`;
  return iguales(hex(await firmar(plantilla, secreto)), partes.v1.toLowerCase());
}

// Estados de Mercado Pago llevados a los de la app.
export function estadoDeMercadoPago(status: string) {
  if (status === "approved") return "pagado" as const;
  if (status === "rejected" || status === "cancelled" || status === "refunded" || status === "charged_back") return "cancelado" as const;
  return "pendiente" as const;
}
