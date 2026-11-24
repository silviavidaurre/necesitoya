// Prueba lo que da confianza: diagnóstico con IA, verificado, cerrar el trabajo, pago protegido con Cosmos,
// webhook firmado e historial del trabajador.
// Uso: node pruebas/confianza.mjs [url]   (por defecto http://localhost:3000)
// Para probar el webhook firmado lee COSMOS_WEBHOOK_SECRET del entorno o de .env.local (nunca lo imprime).
// Crea datos de prueba con cuentas .test: no cuentan en las métricas y se borran después.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { cuentaDePrueba } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const respuestas = [];
const j = async (ruta, cuerpo, encabezados = {}) => {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(U + ruta, cuerpo !== undefined ? { method: "POST", headers: { "content-type": "application/json", ...encabezados }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) } : undefined);
      const datos = await r.json().catch(() => null);
      if (!ruta.startsWith("/api/prestadores")) respuestas.push(JSON.stringify(datos));
      return { estado: r.status, datos };
    } catch (error) {
      if (intento >= 3) throw error;
    }
  }
};

function secretoDelWebhook() {
  if (process.env.COSMOS_WEBHOOK_SECRET) return process.env.COSMOS_WEBHOOK_SECRET;
  try {
    const linea = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find((l) => l.startsWith("COSMOS_WEBHOOK_SECRET="));
    return linea ? linea.slice("COSMOS_WEBHOOK_SECRET=".length).trim() : "";
  } catch {
    return "";
  }
}

// Una dirección Stellar válida (con su dígito verificador) armada al azar, para la billetera de prueba.
function billeteraDePrueba() {
  if (process.env.PRUEBA_BILLETERA) return process.env.PRUEBA_BILLETERA;
  const crc = (bytes) => {
    let c = 0;
    for (const b of bytes) {
      c ^= b << 8;
      for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  };
  const cuerpo = Buffer.concat([Buffer.from([6 << 3]), Buffer.from(crypto.getRandomValues(new Uint8Array(32)))]);
  const control = crc(cuerpo);
  const todo = Buffer.concat([cuerpo, Buffer.from([control & 0xff, control >> 8])]);
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, valor = 0, salida = "";
  for (const b of todo) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += alfabeto[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return salida;
}

function png(gris) {
  const crcTabla = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTabla[n] = c >>> 0;
  }
  const crc = (b) => {
    let x = 0xffffffff;
    for (const v of b) x = crcTabla[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo, datos) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, gris)]);
  const crudo = Buffer.concat(Array.from({ length: 64 }, () => fila));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(crudo, { level: 0 })), trozo("IEND", Buffer.alloc(0))]).toString("base64");
}

const stats = (await j("/api/stats")).datos;
console.log(`IA: ${stats.ia ? "sí" : "no"} · pagos: ${stats.pagos ? "sí" : "no"}`);

// --- Diagnóstico ---------------------------------------------------------------------------------
const gas = await j("/api/ia/pedido", { texto: "hay olor a gas cerca del calefón y la llama piloto se apaga sola, lo necesito hoy" });
const dGas = gas.datos?.pedido?.diagnostico;
ok("el pedido trae diagnóstico", gas.estado === 200 && Boolean(dGas), JSON.stringify(dGas ?? {}).slice(0, 160));
ok("con gas pide gasista matriculado", dGas?.matriculado === "gasista");
ok("con gas trae pasos de seguridad primero", Array.isArray(dGas?.seguridad) && dGas.seguridad.some((p) => /llave de paso/i.test(p)));
ok("con gas el riesgo no es bajo", dGas?.riesgo === "medio" || dGas?.riesgo === "alto");
ok("trae preguntas para el prestador", Array.isArray(dGas?.preguntas) && dGas.preguntas.length > 0);
if (stats.ia) ok("con IA dice la causa como probabilidad", typeof dGas?.causa === "string" && /probable|suele/i.test(dGas.causa), dGas?.causa ?? "");

const luz = await j("/api/ia/pedido", { texto: "salta la térmica cada vez que enchufo el horno eléctrico" });
ok("con electricidad pide electricista matriculado", luz.datos?.pedido?.diagnostico?.matriculado === "electricista");

const canilla = await j("/api/ia/pedido", { texto: "gotea la canilla del baño todo el día" });
ok("con una canilla no pide matriculado", canilla.datos?.pedido?.diagnostico?.matriculado === "");

// El celular no puede bajar el riesgo ni sacar el aviso de matriculado: el servidor lo vuelve a aplicar.
const vecina = await cuentaDePrueba(U, "vecina");
const trucho = { causa: "Nada grave.", riesgo: "bajo", queHacerYa: ["Arreglalo vos con un destornillador"], materiales: [], preguntas: [], matriculado: "", seguridad: [] };
const alta = await j("/api/pedidos", { titulo: "Prueba de confianza: olor a gas en la cocina", descripcion: "Huele a gas cerca de la hornalla.", rubro: "gas", urgencia: "hoy", zona: "Alto Comedero", precioMin: 40000, precioMax: 70000, clienteNombre: "Vecina Confianza", cuenta: vecina, diagnostico: trucho });
ok("publica el pedido", alta.estado === 201, alta.datos?.error ?? "");
const { id, clave } = alta.datos;

const cuentaPrestador = await cuentaDePrueba(U, "prestador");
const conBilleteraMala = await j("/api/prestadores", { nombre: "Gasista Confianza", rubros: ["gas"], zonas: ["Alto Comedero"], aniosExperiencia: 8, descripcion: "Prueba", cuenta: cuentaPrestador, billetera: "GABCDEF" });
ok("una billetera mal copiada se rechaza", conBilleteraMala.estado === 400, conBilleteraMala.datos?.error ?? "");
const pr = (await j("/api/prestadores", { nombre: "Gasista Confianza", rubros: ["gas"], zonas: ["Alto Comedero"], aniosExperiencia: 8, descripcion: "Prueba", cuenta: cuentaPrestador })).datos.prestador;
ok("el prestador se anota con su cuenta", Boolean(pr?.id) && pr.conCuenta === true);
const visto = (await j(`/api/pedidos?prestadorId=${pr.id}`)).datos.pedidos.find((p) => p.id === id);
ok("el prestador ve el diagnóstico en el pedido", Boolean(visto?.diagnostico));
ok("el servidor vuelve a poner gasista matriculado y seguridad", visto?.diagnostico?.matriculado === "gasista" && visto.diagnostico.seguridad.length > 0);
ok("y sube el riesgo a medio por lo menos", visto?.diagnostico?.riesgo !== "bajo");

// --- Verificado -----------------------------------------------------------------------------------
const oferta = await j("/api/ofertas", { pedidoId: id, prestadorId: pr.id, precio: 60000, cuando: "Hoy", mensaje: "Voy con el detector" });
ok("presupuesta", oferta.estado === 201, oferta.datos?.error ?? "");
const seg = (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos;
ok("cada presupuesto dice el nivel de verificación", seg.ofertas[0]?.prestador?.nivel === 1);
ok("y si cobra por la app", seg.ofertas[0]?.prestador?.cobraPorLaApp === false);
const perfil = (await j(`/api/perfil?id=${pr.idPublico}`)).datos.perfil;
ok("el perfil público dice el nivel y el historial", perfil.nivel === 1 && perfil.reputacion.terminados === 0 && perfil.reputacion.cobrados === 0);

// --- Pago -----------------------------------------------------------------------------------------
ok("no se paga antes de elegir", (await j("/api/pagos", { id, clave })).estado === 409);
await j("/api/pedido/elegir", { id, clave, ofertaId: oferta.datos.oferta.id });
ok("otro no puede pagar ni ver el pago", (await j("/api/pagos", { id, clave: "otra" })).estado === 403 && (await j(`/api/pagos?id=${id}&clave=otra`)).estado === 403);
const sinBilletera = await j("/api/pagos", { id, clave });
ok("sin billetera del prestador (o sin Cosmos) no se arma el pago", sinBilletera.estado === 409 || sinBilletera.estado === 503, `(${sinBilletera.estado}) ${sinBilletera.datos?.error ?? ""}`);

const billetera = billeteraDePrueba();
const conBilletera = await j("/api/prestadores", { id: pr.id, nombre: "Gasista Confianza", rubros: ["gas"], zonas: ["Alto Comedero"], aniosExperiencia: 8, descripcion: "Prueba", billetera });
ok("carga la billetera en el perfil", conBilletera.estado === 200 && conBilletera.datos.prestador.billetera === billetera, conBilletera.datos?.error ?? "");
const publicoConBilletera = JSON.stringify((await j(`/api/perfil?id=${pr.idPublico}`)).datos);
ok("la billetera no sale en el perfil público", !publicoConBilletera.includes(billetera));

let pago = null;
if (stats.pagos) {
  const creado = await j("/api/pagos", { id, clave });
  pago = creado.datos?.pago;
  ok("arma el pago protegido en Cosmos", creado.estado === 201 && pago?.modo === "protegido" && /^https:/.test(pago?.urlDePago ?? ""), `(${creado.estado}) ${creado.datos?.error ?? creado.datos?.codigo ?? ""}`);
  ok("el pago dice el monto en USDC y la comisión aparte", Number(pago?.monto) >= 1 && Number(pago?.comision) > 0 && pago?.moneda === "USDC");
  const otraVez = await j("/api/pagos", { id, clave });
  ok("pedirlo de nuevo no arma otro", otraVez.datos?.pago?.urlDePago === pago?.urlDePago);
  ok("la respuesta no trae la billetera ni la clave de Cosmos", !JSON.stringify(creado.datos).includes(billetera) && !JSON.stringify(creado.datos).includes("dv_"));
} else {
  console.log("(sin Cosmos configurado: se salta el pago real)");
}

// --- Webhook firmado -----------------------------------------------------------------------------
const sinFirma = await j("/api/pagos/webhook", { type: "PROTECTED_PAYMENT_FUNDED", data: { id: "x", status: "FUNDED" } });
ok("el webhook sin firma se rechaza", sinFirma.estado === 400 || sinFirma.estado === 503, `(${sinFirma.estado})`);
const secreto = secretoDelWebhook();
const firmar = (cuerpo, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex")}`;
if (secreto) {
  const falso = JSON.stringify({ id: "evt", type: "PROTECTED_PAYMENT_FUNDED", data: { id: "x", status: "FUNDED" } });
  ok("una firma con otro secreto se rechaza", (await j("/api/pagos/webhook", falso, { "x-cosmos-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` })).estado === 400);
  ok("una firma vieja se rechaza", (await j("/api/pagos/webhook", falso, { "x-cosmos-signature": firmar(falso, Math.floor(Date.now() / 1000) - 3600) })).estado === 400);
}

// --- Cerrar el trabajo -----------------------------------------------------------------------------
await j("/api/ofertas/terminar", { prestadorId: pr.id, ofertaId: oferta.datos.oferta.id, foto: { tipo: "image/png", base64: png(77) } });
const confirmado = await j("/api/pedido/confirmar", { id, clave });
ok("el vecino confirma", confirmado.estado === 200 && Boolean(confirmado.datos.pedido.confirmado));

if (secreto && pago) {
  // Los pagos protegidos llevan como referencia el id de la oferta: con eso se reconoce el pago.
  const evento = (tipo, status) => JSON.stringify({ id: crypto.randomUUID(), type: tipo, createdAt: new Date().toISOString(), data: { id: "pp-prueba", status, reference: oferta.datos.oferta.id } });
  const fondeado = evento("PROTECTED_PAYMENT_FUNDED", "FUNDED");
  ok("un aviso firmado se acepta", (await j("/api/pagos/webhook", fondeado, { "x-cosmos-signature": firmar(fondeado) })).estado === 200);
  const enSeg = (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos.ofertas.find((o) => o.estado === "elegida");
  ok("con el aviso de Cosmos el pago queda retenido", enSeg?.pago?.estado === "retenido", enSeg?.pago?.estado);
  const liberado = evento("PROTECTED_PAYMENT_RELEASED", "RELEASED");
  await j("/api/pagos/webhook", liberado, { "x-cosmos-signature": firmar(liberado) });
  const delPrestador = (await j(`/api/ofertas?prestadorId=${pr.id}`)).datos.ofertas[0];
  ok("el prestador ve el pago liberado", delPrestador?.pago?.estado === "liberado");
  const historial = (await j(`/api/perfil?id=${pr.idPublico}`)).datos.perfil.reputacion;
  ok("el historial suma el trabajo terminado y cobrado por la app", historial.terminados === 1 && historial.cobrados === 1, JSON.stringify(historial));
} else {
  const historial = (await j(`/api/perfil?id=${pr.idPublico}`)).datos.perfil.reputacion;
  ok("el historial suma el trabajo terminado", historial.terminados === 1, JSON.stringify(historial));
}
const nota = await j("/api/pedido/calificar", { id, clave, estrellas: 5, comentario: "Detectó la pérdida enseguida." });
ok("después de confirmar, califica", nota.estado === 200);

const todo = respuestas.join(" ");
ok(`en ${respuestas.length} respuestas no sale la billetera ni el mail de las cuentas`, !todo.includes(billetera) && !todo.includes("@necesitoya.test"));
console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
