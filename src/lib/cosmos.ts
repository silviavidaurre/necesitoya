import { variable } from "./config";
import { billeteraValida } from "./stellar";

// Cliente mínimo de la API de Cosmos Pay (pagos en USDC sobre Stellar). Habla con la API REST con fetch,
// así corre igual en el Worker y en desarrollo. La clave nunca sale del servidor ni se escribe en los registros.
//
// Cómo se usa en NecesitoYa:
// - Pago protegido (por defecto): el vecino paga el trabajo en un contrato que retiene la plata hasta que él confirma.
//   El que cobra (merchantAddress) es la billetera del prestador. El vecino aprueba y libera en la página de Cosmos.
// - Comisión: los pagos protegidos de Cosmos no aceptan `merchantFee`, así que la comisión fija de NecesitoYa va
//   en un cobro aparte y chico, en el mismo paso, a la billetera de NecesitoYa.
// - Pago directo (COSMOS_MODO=directo): un solo cobro al prestador con `merchantFee`, que separa la comisión en la
//   misma transacción. No queda retenido.

const BASE = "https://api.cosmospay.lat/cosmos-api";
const CHECKOUT = "https://payments.cosmospay.lat";

export const USDC = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  public: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export class ErrorDeCosmos extends Error {
  constructor(
    mensaje: string,
    public codigo: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

function clave() {
  return variable("COSMOS_API_KEY");
}

export function billeteraDeComision() {
  const billetera = variable("COSMOS_WALLET_COMISION");
  return billetera && billeteraValida(billetera) ? billetera : undefined;
}

// Hay Cosmos si hay clave y billetera para la comisión. Sin eso, la app sigue andando sin pago.
export function cosmosDisponible() {
  return Boolean(clave() && billeteraDeComision());
}

// Las claves dv_ trabajan en testnet; las prod_, en la red principal.
export function redDeCosmos(): "testnet" | "public" {
  return clave()?.startsWith("prod_") ? "public" : "testnet";
}

// Pago protegido o directo. COSMOS_MODO puede forzarlo; si no, se usa el protegido solo cuando la API de Cosmos
// lo tiene publicado (en noviembre de 2026 está documentado pero responde 404) y si no, el directo con merchantFee.
let protegidosEnCosmos: { valor: boolean; hasta: number } | null = null;

export function modoDeCosmos(): "protegido" | "directo" {
  const forzado = variable("COSMOS_MODO");
  if (forzado === "directo" || forzado === "protegido") return forzado;
  return protegidosEnCosmos?.valor ? "protegido" : "directo";
}

// Pregunta a Cosmos si los pagos protegidos ya están disponibles. Se recuerda media hora.
export async function sondearProtegidos() {
  if (!clave() || variable("COSMOS_MODO")) return;
  if (protegidosEnCosmos && protegidosEnCosmos.hasta > Date.now()) return;
  try {
    await llamar("GET", "/v1/protected-payments?take=1");
    protegidosEnCosmos = { valor: true, hasta: Date.now() + 30 * 60_000 };
  } catch (error) {
    // Solo un 404 dice "no existe"; con otro error (sin señal) se vuelve a probar en un minuto.
    const noExiste = error instanceof ErrorDeCosmos && error.estado === 404;
    protegidosEnCosmos = { valor: false, hasta: Date.now() + (noExiste ? 30 * 60_000 : 60_000) };
  }
}

async function llamar<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown, idempotencia?: string): Promise<T> {
  const llave = clave();
  if (!llave) throw new ErrorDeCosmos("Cosmos Pay no está configurado.", "sin_configurar", 503);
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 20_000);
  let respuesta: Response;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: {
        authorization: `Bearer ${llave}`,
        "content-type": "application/json",
        ...(idempotencia ? { "idempotency-key": idempotencia } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: corte.signal,
    });
  } catch {
    throw new ErrorDeCosmos("No pudimos conectar con Cosmos Pay.", "sin_conexion", 502);
  } finally {
    clearTimeout(reloj);
  }
  const datos = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
  if (!respuesta.ok) {
    const codigo = typeof datos?.code === "string" ? datos.code : `http_${respuesta.status}`;
    const mensaje = typeof datos?.message === "string" ? datos.message : "Cosmos Pay rechazó el pedido.";
    // Solo el código y el mensaje de Cosmos: nunca la clave ni los encabezados.
    console.error("[cosmos]", metodo, ruta.replace(/[?].*$/, ""), respuesta.status, codigo, mensaje);
    throw new ErrorDeCosmos(mensaje, codigo, respuesta.status);
  }
  return datos as T;
}

export interface PagoProtegidoDeCosmos {
  id: string;
  status: string;
  checkoutUrl: string;
  amount: string;
  reference?: string | null;
}

export interface IntentoDeCosmos {
  id: string;
  status: string;
  uri: string;
  amount: string | null;
}

// Monto en USDC con dos decimales, como texto: así lo pide la API.
export function usdc(valor: number) {
  return (Math.round(valor * 100) / 100).toFixed(2);
}

export function crearPagoProtegido(datos: { monto: string; billeteraDelPrestador: string; titulo: string; descripcion: string; referencia: string }) {
  return llamar<PagoProtegidoDeCosmos>(
    "POST",
    "/v1/protected-payments",
    {
      amount: datos.monto,
      // El vecino aprueba y libera: así nadie más que él decide cuándo le llega la plata al prestador.
      releaseModel: "BUYER_RELEASES",
      // Si vence el plazo sin liberar, decide la gente de Cosmos con lo que muestren las dos partes.
      deadlinePolicy: variable("COSMOS_POLITICA") ?? "MANUAL_REVIEW",
      deliveryWindowHours: Number(variable("COSMOS_PLAZO_HORAS") ?? 168),
      fundingWindowHours: 48,
      merchantAddress: datos.billeteraDelPrestador,
      title: datos.titulo.slice(0, 80),
      description: datos.descripcion.slice(0, 200),
      reference: datos.referencia,
    },
    `necesitoya-pp-${datos.referencia}`,
  );
}

export function leerPagoProtegido(id: string) {
  return llamar<PagoProtegidoDeCosmos>("GET", `/v1/protected-payments/${encodeURIComponent(id)}`);
}

export function cancelarPagoProtegido(id: string) {
  return llamar<PagoProtegidoDeCosmos>("POST", `/v1/protected-payments/${encodeURIComponent(id)}/cancel`);
}

// Un cobro común (SEP-7) en USDC. Con `comision`, Cosmos la separa a la billetera de NecesitoYa en la misma transacción.
export function crearCobro(datos: { destino: string; monto: string; mensaje: string; memo: string; comision?: string }) {
  const comision = datos.comision ? { fixed: datos.comision, wallet: billeteraDeComision(), paidBy: "payer" } : undefined;
  return llamar<IntentoDeCosmos>("POST", "/v1/payment-intents/pay", {
    destination: datos.destino,
    amount: datos.monto,
    assetCode: "USDC",
    assetIssuer: USDC[redDeCosmos()],
    memo: datos.memo,
    msg: datos.mensaje.slice(0, 280),
    ...(comision ? { merchantFee: comision } : {}),
  });
}

export function leerCobro(id: string) {
  return llamar<IntentoDeCosmos>("GET", `/v1/payment-intents/${encodeURIComponent(id)}`);
}

export function paginaDeCobro(id: string) {
  return `${CHECKOUT}/${encodeURIComponent(id)}`;
}

// Registra la dirección donde Cosmos avisa los cambios de los pagos. Devuelve el secreto de firma (se muestra una sola vez).
export function registrarWebhook(url: string) {
  return llamar<{ id: string; secret?: string }>("POST", "/v1/webhooks", { url, description: "NecesitoYa: pagos" });
}

// Un número de 18 cifras a partir de un id: sirve de memo (MEMO_ID) y de llave para no cobrar dos veces lo mismo.
export async function memoDe(texto: string) {
  const resumen = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  let numero = 0n;
  for (let i = 0; i < 8; i++) numero = (numero << 8n) | BigInt(resumen[i]);
  return (numero % 900000000000000000n + 100000000000000000n).toString();
}

// Comprueba la firma `X-Cosmos-Signature: t=<segundos>,v1=<hmac>` sobre `${t}.${cuerpo}`, con 5 minutos de margen.
export async function firmaValida(cuerpo: string, encabezado: string | null, secreto: string, ahora = Date.now()) {
  if (!encabezado || !secreto) return false;
  const partes = Object.fromEntries(
    encabezado.split(",").map((parte) => {
      const [k, ...v] = parte.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const t = Number(partes.t);
  const firma = String(partes.v1 ?? "").toLowerCase();
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(firma)) return false;
  if (Math.abs(ahora / 1000 - t) > 300) return false;
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const calculada = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(`${partes.t}.${cuerpo}`)));
  const hex = [...calculada].map((b) => b.toString(16).padStart(2, "0")).join("");
  let distinto = 0;
  for (let i = 0; i < 64; i++) distinto |= hex.charCodeAt(i) ^ firma.charCodeAt(i);
  return distinto === 0;
}
