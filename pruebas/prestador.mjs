// Prueba del lado del prestador: lugar reservado para el barrio, perfil público, edición, fotos y reputación.
// Uso: node pruebas/prestador.mjs [url]   (por defecto http://localhost:3000)
// Crea datos de prueba: después hay que borrarlos de la base.
import { DIRECCION, cuentaDePrueba, turnoPara } from "./comun.mjs";
import zlib from "node:zlib";

const U = process.argv[2] ?? "http://localhost:3000";
// Todo lo que el servidor le responde a otra persona se junta acá: al final se revisa que nunca haya salido un teléfono.
// Queda afuera /api/prestadores, que es el perfil propio (se entra con el id secreto y trae el celular de uno mismo).
const TEL_VECINO = "3884000000";
const TEL_PRESTADOR = "3885000000";
const respuestas = [];
// Con mala señal la conexión a veces no llega a abrirse: se reintenta solo en ese caso (el pedido no salió).
const j = async (ruta, cuerpo) => {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
      const datos = await r.json().catch(() => null);
      if (!ruta.startsWith("/api/prestadores")) respuestas.push(JSON.stringify(datos));
      return { estado: r.status, datos };
    } catch (error) {
      if (intento >= 4 || error?.cause?.code !== "UND_ERR_CONNECT_TIMEOUT") throw error;
    }
  }
};
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};

// PNG de 64x64 de un solo color, para probar la subida de fotos.
function png(gris) {
  const crc = (b) => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    let x = 0xffffffff;
    for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([largo, td, c]);
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

const publicos = {};
const prestador = async (nombre, zonas) => {
  const p = (await j("/api/prestadores", { nombre, rubros: ["plomeria"], zonas, aniosExperiencia: 5, descripcion: "Prueba", whatsapp: TEL_PRESTADOR, cuenta: await cuentaDePrueba(U, "prestador") })).datos.prestador;
  publicos[p.id] = p.idPublico;
  return p.id;
};

const alta = await j("/api/pedidos", {
  titulo: "Prueba: pierde la canilla",
  descripcion: "Pedido de prueba interna",
  rubro: "plomeria",
  urgencia: "hoy",
  zona: "Alto Comedero",
  precioMin: 30000,
  precioMax: 50000,
  relato: "prueba",
  clienteNombre: "Vecina De Prueba",
  // Ya no se pide. Se manda igual, como haría una versión vieja de la app, para comprobar que no se le muestra a nadie.
  clienteWhatsapp: TEL_VECINO,
  cuenta: await cuentaDePrueba(U, "vecina"),
});
const { id, clave } = alta.datos;
const a = await prestador("Afuera Uno", ["Centro"]);
const b = await prestador("Afuera Dos", ["Los Perales"]);
const c = await prestador("Afuera Tres", ["Los Perales"]);
const d = await prestador("Del Barrio", ["Alto Comedero"]);
const oferta = (prestadorId, precio) => j("/api/ofertas", { pedidoId: id, prestadorId, precio, cuando: "Hoy", mensaje: "" });

// Lugar reservado para el barrio
ok("1.º de afuera presupuesta", (await oferta(a, 40000)).estado === 201);
ok("2.º de afuera presupuesta", (await oferta(b, 42000)).estado === 201);
const vistaC = (await j(`/api/pedidos?prestadorId=${c}`)).datos.pedidos.find((p) => p.id === id);
ok("3.º de afuera ve el lugar guardado", vistaC.reservadoMin > 0 && vistaC.cupos === 0, `(${vistaC.reservadoMin} min)`);
const rechazo = await oferta(c, 39000);
ok("3.º de afuera no puede presupuestar todavía", rechazo.estado === 409, rechazo.datos?.error ?? "");
const vistaD = (await j(`/api/pedidos?prestadorId=${d}`)).datos.pedidos.find((p) => p.id === id);
ok("el del barrio ve el lugar libre", vistaD.reservadoMin === 0 && vistaD.cupos === 1 && vistaD.enMiZona);
const ofertaD = await oferta(d, 45000);
ok("el del barrio se queda con el último lugar", ofertaD.estado === 201 && ofertaD.datos.posicion === 3);

// Perfil público y edición
const publico = (await j(`/api/perfil?id=${publicos[d]}`)).datos.perfil;
ok("el perfil público no muestra el celular", publico && !("whatsapp" in publico) && !JSON.stringify(publico).includes(TEL_PRESTADOR));
ok("perfil nuevo sin historial", publico.reputacion.trabajos === 0 && publico.reputacion.promedio === null);
const edicion = await j("/api/prestadores", { id: d, nombre: "Del Barrio", rubros: ["plomeria", "gas"], zonas: ["Alto Comedero"], aniosExperiencia: 9, descripcion: "Texto editado", whatsapp: TEL_PRESTADOR });
const propio = (await j(`/api/prestadores?id=${d}`)).datos.prestador;
ok("editar el perfil guarda los cambios", edicion.estado === 200 && propio.descripcion === "Texto editado" && propio.rubros.length === 2 && propio.id === d);
// El celular es opcional: se puede guardar el perfil sin él, y volver a cargarlo.
const sinCelular = await j("/api/prestadores", { id: c, nombre: "Afuera Tres", rubros: ["plomeria"], zonas: ["Los Perales"], aniosExperiencia: 5, descripcion: "Prueba", whatsapp: "" });
ok("editar el perfil sin celular", sinCelular.estado === 200 && sinCelular.datos.prestador.whatsapp === "", sinCelular.datos?.error ?? "");
ok("un celular a medias se rechaza", (await j("/api/prestadores", { id: c, nombre: "Afuera Tres", rubros: ["plomeria"], zonas: [], whatsapp: "38841" })).estado === 400);
ok("editar un perfil inexistente da 404", (await j("/api/prestadores", { id: "no-existe", nombre: "X Y", rubros: ["plomeria"], zonas: [], whatsapp: "3885000000" })).estado === 404);

// Fotos de trabajos
const foto = (gris) => j("/api/prestadores/fotos", { id: d, foto: { tipo: "image/png", base64: png(gris) } });
const f1 = await foto(60);
await foto(120);
const f3 = await foto(180);
ok("sube hasta 3 fotos", f1.estado === 200 && f3.datos.fotos.length === 3);
ok("la cuarta foto se rechaza", (await foto(240)).estado === 409);
const quitada = await j("/api/prestadores/fotos", { id: d, quitar: f1.datos.fotos[0] });
ok("quitar una foto", quitada.datos.fotos.length === 2);
ok("las fotos salen en el perfil público", (await j(`/api/perfil?id=${publicos[d]}`)).datos.perfil.fotos.length === 2);

// Reputación
ok("no se puede calificar antes de elegir", (await j("/api/pedido/calificar", { id, clave, estrellas: 5 })).estado === 409);
const eleccion = await j("/api/pedido/elegir", { id, clave, ofertaId: ofertaD.datos.oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });
const elegidaVista = eleccion.datos.ofertas.find((o) => o.estado === "elegida");
ok("al elegir, el vecino no recibe el celular del prestador", eleccion.estado === 200 && elegidaVista && !("whatsapp" in elegidaVista.prestador));
const misOfertas = (await j(`/api/ofertas?prestadorId=${d}`)).datos.ofertas;
ok("el elegido ve solo el nombre de pila del vecino", misOfertas[0].estado === "elegida" && misOfertas[0].cliente?.nombre === "Vecina" && !("whatsapp" in misOfertas[0].cliente));
ok("otro no puede calificar", (await j("/api/pedido/calificar", { id, clave: "otra", estrellas: 5 })).estado === 403);
ok("estrellas fuera de rango se rechazan", (await j("/api/pedido/calificar", { id, clave, estrellas: 9 })).estado === 400);
// Cerrar el trabajo: el prestador lo marca terminado con la foto del después, el vecino confirma y recién ahí califica.
ok("no se califica antes de confirmar", (await j("/api/pedido/calificar", { id, clave, estrellas: 5 })).estado === 409);
ok("no se confirma antes de que lo marque terminado", (await j("/api/pedido/confirmar", { id, clave })).estado === 409);
ok("otro prestador no puede marcarlo terminado", (await j("/api/ofertas/terminar", { prestadorId: a, ofertaId: ofertaD.datos.oferta.id, foto: { tipo: "image/png", base64: png(90) } })).estado === 403);
ok("sin foto del después no se marca terminado", (await j("/api/ofertas/terminar", { prestadorId: d, ofertaId: ofertaD.datos.oferta.id })).estado === 400);
const terminado = await j("/api/ofertas/terminar", { prestadorId: d, ofertaId: ofertaD.datos.oferta.id, foto: { tipo: "image/png", base64: png(90) } });
ok("el prestador marca el trabajo terminado con la foto", terminado.estado === 200 && Boolean(terminado.datos.terminado?.fotoId), terminado.datos?.error ?? "");
ok("no se marca terminado dos veces", (await j("/api/ofertas/terminar", { prestadorId: d, ofertaId: ofertaD.datos.oferta.id, foto: { tipo: "image/png", base64: png(91) } })).estado === 409);
const conFoto = (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos.ofertas.find((o) => o.estado === "elegida");
ok("el vecino ve la foto del después", Boolean(conFoto?.terminado?.fotoId));
ok("otro no puede confirmar", (await j("/api/pedido/confirmar", { id, clave: "otra" })).estado === 403);
const confirmacion = await j("/api/pedido/confirmar", { id, clave });
ok("el vecino confirma que quedó bien", confirmacion.estado === 200 && Boolean(confirmacion.datos.pedido.confirmado));
const nota = await j("/api/pedido/calificar", { id, clave, estrellas: 5, comentario: "Llegó a horario y quedó perfecto." });
ok("el vecino califica", nota.estado === 200 && nota.datos.pedido.calificacion.estrellas === 5);
ok("no se califica dos veces", (await j("/api/pedido/calificar", { id, clave, estrellas: 1 })).estado === 409);
const final = (await j(`/api/perfil?id=${publicos[d]}`)).datos.perfil;
ok("la reputación aparece en el perfil", final.reputacion.trabajos === 1 && final.reputacion.promedio === 5 && final.resenas.length === 1);
ok("el historial cuenta el trabajo terminado y ninguno cobrado por la app", final.reputacion.terminados === 1 && final.reputacion.cobrados === 0);
ok("el perfil dice si está verificado", final.nivel === 1);
ok("la opinión muestra solo el nombre de pila", final.resenas[0].cliente === "Vecina");
const seg = (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos;
ok("el vecino ve la reputación en cada presupuesto", seg.ofertas.every((o) => o.prestador.reputacion && Array.isArray(o.prestador.fotos)));

const crudo = JSON.stringify(seg) + JSON.stringify(final);
ok("el id secreto no aparece en lo que ve el vecino ni en el perfil público", ![a, b, c, d].some((secreto) => crudo.includes(secreto)));
ok("el id público no sirve para leer el perfil privado", (await j(`/api/prestadores?id=${publicos[d]}`)).estado === 404);
ok("el id secreto no sirve en el perfil público", (await j(`/api/perfil?id=${d}`)).estado === 404);
ok("el id público no sirve para editar", (await j("/api/prestadores", { id: publicos[d], nombre: "Intruso X", rubros: ["plomeria"], zonas: [], whatsapp: "3880000001" })).estado === 404);
ok("el id público no sirve para ver los clientes", ((await j(`/api/ofertas?prestadorId=${publicos[d]}`)).datos.ofertas ?? []).length === 0);
const lista = (await j("/api/pedidos")).datos.pedidos;
ok("la lista pública de pedidos solo muestra el nombre de pila", lista.every((p) => !p.clienteNombre.includes(" ")));

// Se repasan también las listas públicas y el chat, y después todo lo que respondió el servidor.
await j(`/api/pedidos?prestadorId=${a}`);
await j(`/api/chat?ofertaId=${ofertaD.datos.oferta.id}&prestadorId=${d}`);
await j(`/api/chat?ofertaId=${ofertaD.datos.oferta.id}&pedidoId=${id}&clave=${clave}`);
const todo = respuestas.join(" ");
ok(`en ${respuestas.length} respuestas nunca sale un teléfono`, !todo.includes(TEL_VECINO) && !todo.includes(TEL_PRESTADOR) && !todo.includes("whatsapp") && !todo.includes("clienteWhatsapp"));

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
console.log("perfil de prueba:", `${U}/p/${publicos[d]}`);
process.exitCode = fallas === 0 ? 0 : 1;
