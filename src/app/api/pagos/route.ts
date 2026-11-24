import {
  ErrorDeCosmos,
  billeteraDeComision,
  cosmosDisponible,
  crearCobro,
  crearPagoProtegido,
  leerCobro,
  leerPagoProtegido,
  memoDe,
  modoDeCosmos,
  sondearProtegidos,
  paginaDeCobro,
  usdc,
} from "@/lib/cosmos";
import { dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { ErrorDeMercadoPago, crearPreferencia, mercadoPagoDisponible } from "@/lib/mercadopago";
import { anotarEstado, comisionArs, comisionUsdc, cotizacionArsPorUsdc, estadoDeCobro, estadoProtegido, pagoDe, pagoPublico, pagosDisponibles } from "@/lib/pagos";
import type { BaseDeDatos, Pago } from "@/lib/tipos";

// Pago del trabajo elegido, dentro de la app, con Cosmos Pay. Lo hace el vecino dueño del pedido (id + clave).
// Sin Cosmos configurado responde 503 y la app sigue andando: se arreglan el pago por el chat, como antes.

class ErrorDePago extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

function delDuenio(db: BaseDeDatos, id: string, clave: string) {
  const pedido = db.pedidos.find((p) => p.id === id);
  if (!pedido) throw new ErrorDePago("No encontramos ese pedido.", 404);
  if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDePago("Este pedido no es tuyo.", 403);
  const oferta = db.ofertas.find((o) => o.pedidoId === id && o.estado === "elegida");
  if (!oferta) throw new ErrorDePago("Primero elegí un presupuesto.", 409);
  return { pedido, oferta };
}

function responderError(error: unknown) {
  if (error instanceof ErrorDePago) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorDeMercadoPago) return Response.json({ error: "Mercado Pago no aceptó el pago. Probá de nuevo en un rato." }, { status: 502 });
  if (error instanceof ErrorDeCosmos) {
    // Si la que no acepta USDC es la billetera de la comisión, el problema es nuestro, no del prestador.
    if (error.codigo === "trustline_missing" && /merchant fee/i.test(error.message)) {
      return Response.json({ error: "El pago por la app no está disponible en este momento. Arreglen el pago por el chat.", codigo: "comision_sin_usdc" }, { status: 503 });
    }
    const mensaje =
      error.codigo === "trustline_missing"
        ? "La billetera del prestador todavía no acepta USDC. Avisale por el chat."
        : error.codigo === "sin_conexion"
          ? "No pudimos conectar con el sistema de pagos. Probá de nuevo."
          : "El sistema de pagos no aceptó el pago. Probá de nuevo en un rato.";
    return Response.json({ error: mensaje, codigo: error.codigo }, { status: 502 });
  }
  throw error;
}

// Trae el estado del pago desde Cosmos (por si el aviso del webhook no llegó) y lo guarda si cambió.
export async function sincronizar(pago: Pago): Promise<Pago> {
  if (!cosmosDisponible() || pago.proveedor !== "cosmos") return pago;
  // No se consulta más de una vez cada 15 segundos por pago.
  if (Date.now() - Date.parse(pago.actualizado) < 15_000) return pago;
  const cambios: { estado?: Pago["estado"]; comisionPagada?: boolean } = {};
  try {
    if (pago.modo === "protegido") {
      cambios.estado = estadoProtegido((await leerPagoProtegido(pago.externoId)).status);
      if (pago.comisionId && !pago.comisionPagada) cambios.comisionPagada = estadoDeCobro((await leerCobro(pago.comisionId)).status) === "pagado";
    } else {
      cambios.estado = estadoDeCobro((await leerCobro(pago.externoId)).status);
      cambios.comisionPagada = cambios.estado === "pagado";
    }
  } catch {
    return pago;
  }
  return modificar((db) => {
    const actual = (db.pagos ?? []).find((p) => p.id === pago.id);
    if (!actual) return pago;
    if (cambios.estado) anotarEstado(actual, cambios.estado, "consulta");
    if (cambios.comisionPagada) actual.comisionPagada = true;
    actual.actualizado = new Date().toISOString();
    return actual;
  });
}

// Estado del pago del trabajo elegido.
export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  try {
    const db = await leer();
    const { oferta } = delDuenio(db, parametros.get("id") ?? "", parametros.get("clave") ?? "");
    const pago = pagoDe(db, oferta.id);
    return Response.json({ disponible: pagosDisponibles(), pago: pagoPublico(pago ? await sincronizar(pago) : null) });
  } catch (error) {
    return responderError(error);
  }
}

// Arma el pago (o devuelve el que ya está armado) y responde dónde pagar.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });

  try {
    const db = await leer();
    const { pedido, oferta } = delDuenio(db, id, clave);
    const existente = pagoDe(db, oferta.id);
    if (existente) return Response.json({ pago: pagoPublico(await sincronizar(existente)) });

    const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
    if (!prestador || prestador.ejemplo || oferta.ejemplo) throw new ErrorDePago("Es un presupuesto de muestra: no se puede pagar.", 409);
    if (!pagosDisponibles()) throw new ErrorDePago("El pago por la app todavía no está disponible. Arreglen el pago por el chat.", 503);
    const comisionA = billeteraDeComision();
    const porCosmos = cosmosDisponible() && Boolean(comisionA) && Boolean(prestador.billetera);
    const porMercadoPago = !porCosmos && mercadoPagoDisponible() && Boolean(prestador.mercadopago);
    if (!porCosmos && !porMercadoPago) throw new ErrorDePago("Este prestador todavía no cobra por la app. Arreglen el pago por el chat.", 409);
    if (!(await dentroDelCupoDe("pagos", pedido.cuenta))) throw new ErrorDePago("Hiciste muchos intentos de pago hoy. Probá mañana.", 429);

    // Mercado Pago: cobro directo en pesos en la cuenta del prestador, con la comisión fija separada (marketplace_fee).
    if (porMercadoPago && prestador.mercadopago) {
      const origen = new URL(request.url).origin;
      const comision = comisionArs();
      const preferencia = await crearPreferencia({
        token: prestador.mercadopago.token,
        titulo: `NecesitoYa: ${pedido.titulo}`,
        precio: oferta.precio,
        comision,
        referencia: oferta.id,
        notificacion: `${origen}/api/mercadopago/webhook?oferta=${encodeURIComponent(oferta.id)}`,
        vuelta: `${origen}/pedido/${pedido.id}`,
      });
      const ahoraMp = new Date().toISOString();
      const pagoMp: Pago = {
        id: nuevoId(),
        ofertaId: oferta.id,
        pedidoId: pedido.id,
        proveedor: "mercadopago",
        modo: "directo",
        estado: "pendiente",
        montoArs: oferta.precio,
        monto: String(oferta.precio),
        moneda: "ARS",
        comision: String(comision),
        comisionPagada: false,
        externoId: preferencia.id,
        urlDePago: preferencia.init_point,
        eventos: [{ tipo: "creado", creado: ahoraMp }],
        creado: ahoraMp,
        actualizado: ahoraMp,
      };
      const guardadoMp = await modificar((actual) => {
        const ya = pagoDe(actual, oferta.id);
        if (ya) return ya;
        actual.pagos = [...(actual.pagos ?? []), pagoMp];
        return pagoMp;
      });
      return Response.json({ pago: pagoPublico(guardadoMp) }, { status: 201 });
    }
    if (!comisionA || !prestador.billetera) throw new ErrorDePago("Este prestador todavía no cobra por la app.", 409);

    await sondearProtegidos();
    const cotizacion = await cotizacionArsPorUsdc();
    // Los pagos protegidos de Cosmos van de 1 a 1.000.000 USDC.
    const monto = usdc(Math.max(1, oferta.precio / cotizacion));
    const comision = comisionUsdc();
    let modo = modoDeCosmos();
    const titulo = `NecesitoYa: ${pedido.titulo}`;
    const ahora = new Date().toISOString();
    const base = {
      id: nuevoId(),
      ofertaId: oferta.id,
      pedidoId: pedido.id,
      proveedor: "cosmos" as const,
      modo,
      montoArs: oferta.precio,
      monto,
      moneda: "USDC" as const,
      comision,
      comisionPagada: false,
      cotizacion,
      eventos: [{ tipo: "creado", creado: ahora }],
      creado: ahora,
      actualizado: ahora,
    };

    // Si Cosmos todavía no tiene publicados los pagos protegidos (responde 404), se cobra directo con merchantFee.
    const protegido =
      modo === "protegido"
        ? await crearPagoProtegido({
            monto,
            billeteraDelPrestador: prestador.billetera,
            titulo,
            descripcion: `Trabajo de ${prestador.nombre.split(" ")[0]}. La plata queda retenida hasta que confirmes que quedó bien.`,
            referencia: oferta.id,
          }).catch((error) => {
            if (error instanceof ErrorDeCosmos && error.estado === 404) return null;
            throw error;
          })
        : null;
    if (!protegido) modo = "directo";

    let pago: Pago;
    if (protegido) {
      // Los pagos protegidos no aceptan merchantFee: la comisión fija va en un cobro aparte a la billetera de NecesitoYa.
      const cobroComision = await crearCobro({
        destino: comisionA,
        monto: comision,
        mensaje: "Comisión de NecesitoYa",
        memo: await memoDe(`comision-${oferta.id}`),
      }).catch((error) => {
        // Sin el cobro de la comisión el trabajo igual se puede pagar protegido.
        console.error("[pagos] comisión", error instanceof ErrorDeCosmos ? error.codigo : "error");
        return null;
      });
      pago = {
        ...base,
        modo: "protegido",
        estado: estadoProtegido(protegido.status),
        externoId: protegido.id,
        urlDePago: protegido.checkoutUrl,
        comisionId: cobroComision?.id,
        urlDeComision: cobroComision ? paginaDeCobro(cobroComision.id) : undefined,
      };
    } else {
      // Pago directo: un solo cobro al prestador, con la comisión separada en la misma transacción (merchantFee).
      const cobro = await crearCobro({
        destino: prestador.billetera,
        monto,
        mensaje: titulo,
        memo: await memoDe(`directo-${oferta.id}`),
        comision,
      });
      pago = {
        ...base,
        modo: "directo",
        estado: estadoDeCobro(cobro.status),
        externoId: cobro.id,
        // Con merchantFee la dirección del cobro ya es la página de pago de Cosmos.
        urlDePago: cobro.uri.startsWith("http") ? cobro.uri : paginaDeCobro(cobro.id),
      };
    }

    const guardado = await modificar((actual) => {
      const ya = pagoDe(actual, oferta.id);
      if (ya) return ya;
      actual.pagos = [...(actual.pagos ?? []), pago];
      return pago;
    });
    return Response.json({ pago: pagoPublico(guardado) }, { status: 201 });
  } catch (error) {
    return responderError(error);
  }
}
