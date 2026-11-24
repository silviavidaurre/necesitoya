// Prueba de punta a punta del circuito vecino <-> prestador contra un servidor (local o publicado).
import { DIRECCION, cuentaDePrueba, turnoPara } from "./comun.mjs";
import zlib from "node:zlib";
const U = process.argv[2] ?? "http://localhost:3000";
const j = async (ruta, cuerpo) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  return { estado: r.status, datos: await r.json().catch(() => null) };
};
// PNG de 64x64 de un solo color, para probar la subida de fotos.
function png() {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4); ihdr[8] = 8; ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, 120)]);
  const crudo = Buffer.concat(Array.from({ length: 64 }, () => fila));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(crudo, { level: 0 })), trozo("IEND", Buffer.alloc(0))]).toString("base64");
}
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK  " : "FALLA"} ${nombre} ${extra}`);
};
// Los teléfonos de prueba: no pueden aparecer en NINGUNA respuesta. Todo el contacto es por el chat de la app.
const TEL_VECINO = "3884000000";
const TEL_PRESTADOR = "3885000000";
const sinTelefonos = (...respuestas) => {
  const crudo = respuestas.map((r) => JSON.stringify(r.datos)).join(" ");
  return !crudo.includes(TEL_VECINO) && !crudo.includes(TEL_PRESTADOR) && !crudo.includes("whatsapp") && !crudo.includes("clienteWhatsapp");
};

const t0 = Date.now();
const ia = await j("/api/ia/pedido", { texto: "buenas se me rompio el termotanque pierde agua por abajo y no calienta nada lo necesito para hoy si se puede" });
ok("IA arma el pedido", ia.estado === 200, `(${Date.now() - t0} ms) ${JSON.stringify(ia.datos)}`);

const foto = { tipo: "image/png", base64: png() };
const cuentaVecina = await cuentaDePrueba(U, "vecina");
const sinCuenta = await j("/api/pedidos", { ...ia.datos.pedido, zona: "Alto Comedero", clienteNombre: "Sin Cuenta" });
ok("sin cuenta no se puede pedir", sinCuenta.estado === 401, sinCuenta.datos?.error ?? "");
const prestadorSinCuenta = await j("/api/prestadores", { nombre: "Sin Cuenta", rubros: ["plomeria"], zonas: ["Centro"] });
ok("sin cuenta no se puede anotar", prestadorSinCuenta.estado === 401, prestadorSinCuenta.datos?.error ?? "");
const p = ia.datos.pedido;
const alta = await j("/api/pedidos", { ...p, zona: "Alto Comedero", relato: "se me rompio el termotanque pierde agua por abajo", clienteNombre: "Vecina Prueba", foto, cuenta: cuentaVecina });
ok("publicar pedido solo con el nombre, sin teléfono", alta.estado === 201 && alta.datos.id && alta.datos.clave, alta.datos?.error ?? "");
const { id, clave } = alta.datos;

const sinDatos = await j("/api/pedidos", { titulo: "x", cuenta: cuentaVecina });
ok("rechaza pedido incompleto", sinDatos.estado === 400, sinDatos.datos.error);

const sinCel = await j("/api/prestadores", { nombre: "Prestador Sin Celular", rubros: [p.rubro], zonas: ["Centro"], aniosExperiencia: 2, descripcion: "Prueba", cuenta: await cuentaDePrueba(U, "prestador") });
ok("el prestador se anota sin celular", sinCel.estado === 201 && sinCel.datos.prestador.whatsapp === "", sinCel.datos?.error ?? "");
const celCorto = await j("/api/prestadores", { nombre: "Prestador Cel Corto", rubros: [p.rubro], zonas: ["Centro"], whatsapp: "388", cuenta: await cuentaDePrueba(U, "prestador") });
ok("un celular a medias se rechaza", celCorto.estado === 400, celCorto.datos?.error ?? "");
const pr = await j("/api/prestadores", { nombre: "Prestador Prueba", rubros: [p.rubro], zonas: ["Alto Comedero"], aniosExperiencia: 9, descripcion: "Prueba", whatsapp: TEL_PRESTADOR, cuenta: await cuentaDePrueba(U, "prestador") });
const pid = pr.datos.prestador.id;
const lista = await j(`/api/pedidos?prestadorId=${pid}`);
const visto = lista.datos.pedidos.find((x) => x.id === id);
ok("el prestador ve el pedido primero y en su zona", lista.datos.pedidos[0].id === id && visto.enMiZona);
ok("la lista no filtra teléfono ni clave", !("clienteWhatsapp" in visto) && !("claveCliente" in visto) && sinTelefonos(lista) && !JSON.stringify(lista.datos).includes(clave));
ok("trae relato y foto", Boolean(visto.relato) && Boolean(visto.fotoId));

const f = await fetch(`${U}/api/fotos?id=${visto.fotoId}`);
ok("la foto se sirve", f.status === 200 && f.headers.get("content-type") === "image/png", `(${(await f.arrayBuffer()).byteLength} bytes)`);

const of = await j("/api/ofertas", { pedidoId: id, prestadorId: pid, precio: 65000, cuando: "Hoy", mensaje: "Voy con repuestos" });
ok("enviar presupuesto", of.estado === 201);

const ajeno = await j(`/api/pedido?id=${id}&clave=otra-clave`);
ok("otro no puede ver el seguimiento", ajeno.estado === 403);
const seg = await j(`/api/pedido?id=${id}&clave=${clave}`);
ok("el vecino ve 1 presupuesto, sin teléfono", seg.datos.ofertas.length === 1 && !("whatsapp" in seg.datos.ofertas[0].prestador) && sinTelefonos(seg));
ok("el presupuesto trae el contador de mensajes", seg.datos.ofertas[0].sinLeer === 0 && seg.datos.ofertas[0].mensajes === 0);

const antes = await j(`/api/ofertas?prestadorId=${pid}`);
ok("antes de elegir, el prestador solo ve el nombre de pila", antes.datos.ofertas[0].cliente?.nombre === "Vecina" && sinTelefonos(antes));

const el = await j("/api/pedido/elegir", { id, clave, ofertaId: of.datos.oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });
ok("elegir presupuesto", el.estado === 200 && el.datos.pedido.estado === "cerrado" && el.datos.ofertas[0].estado === "elegida");
ok("al elegir no se revela el teléfono del prestador", !("whatsapp" in el.datos.ofertas[0].prestador) && sinTelefonos(el));
const dos = await j("/api/pedido/elegir", { id, clave, ofertaId: of.datos.oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });
ok("no deja elegir dos veces", dos.estado === 409);

const despues = await j(`/api/ofertas?prestadorId=${pid}`);
ok("el elegido no recibe el teléfono del vecino, solo su nombre de pila", despues.datos.ofertas[0].estado === "elegida" && despues.datos.ofertas[0].cliente?.nombre === "Vecina" && !("whatsapp" in despues.datos.ofertas[0].cliente) && sinTelefonos(despues));

// Una app vieja todavía puede mandar el teléfono: se acepta, pero no sale por ningún lado, ni para quien resulta elegido.
const conTel = await j("/api/pedidos", { ...p, zona: "Alto Comedero", relato: "pedido con telefono de una version vieja", clienteNombre: "Vecina Vieja", clienteWhatsapp: "388 400-0000", cuenta: cuentaVecina });
ok("un pedido que trae teléfono igual se publica", conTel.estado === 201);
const of2 = await j("/api/ofertas", { pedidoId: conTel.datos.id, prestadorId: pid, precio: 70000, cuando: "Hoy", mensaje: "" });
const el2 = await j("/api/pedido/elegir", { id: conTel.datos.id, clave: conTel.datos.clave, ofertaId: of2.datos.oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });
const seg2 = await j(`/api/pedido?id=${conTel.datos.id}&clave=${conTel.datos.clave}`);
const mias2 = await j(`/api/ofertas?prestadorId=${pid}`);
const charla = await j(`/api/chat?ofertaId=${of2.datos.oferta.id}&prestadorId=${pid}`);
ok("con teléfono guardado de los dos lados, ninguna respuesta lo muestra", el2.estado === 200 && charla.estado === 200 && sinTelefonos(of2, el2, seg2, mias2, charla, await j("/api/pedidos"), await j(`/api/pedidos?prestadorId=${pid}`)));
const cerrado = await j(`/api/pedidos?prestadorId=${pid}`);
ok("el pedido cerrado sale de la lista", !cerrado.datos.pedidos.some((x) => x.id === id));
console.log("stats:", JSON.stringify((await j("/api/stats")).datos));
console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
