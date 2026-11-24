// Prueba del chat de un presupuesto: quién puede leer y escribir, que nunca pase un teléfono,
// el contador de mensajes sin leer y los límites.
// Uso: node pruebas/chat.mjs [url]   (por defecto http://localhost:3000)
// Crea datos de prueba: después hay que borrarlos de la base.
import { DIRECCION, cuentaDePrueba, turnoPara } from "./comun.mjs";
const U = process.argv[2] ?? "http://localhost:3000";
const OCULTO = "[número oculto]";

// Todo lo que responde el servidor a otra persona se junta acá: al final se revisa que no haya salido nada privado.
// Queda afuera /api/prestadores (el perfil propio) y el alta de pedidos (que le devuelve la clave a su dueño).
const respuestas = [];
const j = async (ruta, cuerpo) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  const datos = await r.json().catch(() => null);
  if (!ruta.startsWith("/api/prestadores") && ruta !== "/api/pedidos") respuestas.push(JSON.stringify(datos));
  return { estado: r.status, datos };
};
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};

const pedidoNuevo = async (titulo, nombre) =>
  (await j("/api/pedidos", { titulo, descripcion: "Pedido de prueba del chat", rubro: "plomeria", urgencia: "hoy", zona: "Alto Comedero", precioMin: 30000, precioMax: 50000, relato: "prueba", clienteNombre: nombre, cuenta: await cuentaDePrueba(U, "vecina") })).datos;
const prestadorNuevo = async (nombre) =>
  (await j("/api/prestadores", { nombre, rubros: ["plomeria"], zonas: ["Alto Comedero"], aniosExperiencia: 5, descripcion: "Prueba", whatsapp: "3885111222", cuenta: await cuentaDePrueba(U, "prestador") })).datos.prestador;

const { id, clave } = await pedidoNuevo("Prueba de chat: pierde la canilla", "Carla Gutierrez");
const otroPedido = await pedidoNuevo("Prueba de chat: otro pedido", "Otra Vecina");
const ana = await prestadorNuevo("Ana Torres");
const beto = await prestadorNuevo("Beto Ruiz");
const colado = await prestadorNuevo("Colado Sin Oferta");
const ofertaDe = async (prestador, precio) => (await j("/api/ofertas", { pedidoId: id, prestadorId: prestador.id, precio, cuando: "Hoy", mensaje: "" })).datos.oferta.id;
const deAna = await ofertaDe(ana, 40000);
const deBeto = await ofertaDe(beto, 42000);

const comoVecino = { pedidoId: id, clave };
const leer = (ofertaId, quien, desde) => j(`/api/chat?${new URLSearchParams({ ofertaId, ...quien, ...(desde ? { desde } : {}) })}`);
const escribir = (ofertaId, quien, texto) => j("/api/chat", { ofertaId, ...quien, texto });

// --- Se escriben ---------------------------------------------------------------------------------
const vacio = await leer(deAna, comoVecino);
ok("el vecino abre el chat antes de elegir", vacio.estado === 200 && vacio.datos.mensajes.length === 0 && vacio.datos.abierto === true && vacio.datos.soy === "vecino");
ok("el vecino ve con quién habla: solo el nombre de pila", vacio.datos.con.nombre === "Ana" && vacio.datos.pedido.titulo.startsWith("Prueba de chat"));
const m1 = await escribir(deAna, comoVecino, "Hola Ana, ¿el precio incluye el repuesto?");
ok("el vecino pregunta", m1.estado === 201 && m1.datos.mensaje.de === "vecino" && m1.datos.oculto === false);
const m2 = await escribir(deAna, { prestadorId: ana.id }, "Hola Carla. Sí, incluye el cuerito y la mano de obra.");
ok("el prestador responde", m2.estado === 201 && m2.datos.mensaje.de === "prestador");
const vistaAna = await leer(deAna, { prestadorId: ana.id });
ok("el prestador ve los dos mensajes y el nombre de pila del vecino", vistaAna.datos.mensajes.length === 2 && vistaAna.datos.con.nombre === "Carla" && vistaAna.datos.soy === "prestador");
ok("los mensajes vienen en orden", vistaAna.datos.mensajes[0].id === m1.datos.mensaje.id && vistaAna.datos.mensajes[1].id === m2.datos.mensaje.id);
const nuevos = await leer(deAna, comoVecino, m1.datos.mensaje.creado);
ok("con `desde` llegan solo los nuevos", nuevos.datos.mensajes.length === 1 && nuevos.datos.mensajes[0].id === m2.datos.mensaje.id);

// --- Quién puede entrar --------------------------------------------------------------------------
ok("sin credenciales: 403", (await leer(deAna, {})).estado === 403);
ok("con otra clave: 403", (await leer(deAna, { pedidoId: id, clave: "otra-clave" })).estado === 403);
ok("el dueño de otro pedido no puede leer: 403", (await leer(deAna, { pedidoId: otroPedido.id, clave: otroPedido.clave })).estado === 403);
ok("un prestador sin presupuesto en el pedido no puede leer: 403", (await leer(deAna, { prestadorId: colado.id })).estado === 403);
ok("el prestador de otro presupuesto no puede leer: 403", (await leer(deAna, { prestadorId: beto.id })).estado === 403);
ok("el id público de la prestadora no sirve para entrar: 403", (await leer(deAna, { prestadorId: ana.idPublico })).estado === 403);
ok("un tercero no puede escribir: 403", (await escribir(deAna, { prestadorId: colado.id }, "Hola, yo te lo hago más barato")).estado === 403);
ok("el prestador de otro presupuesto no puede escribir: 403", (await escribir(deAna, { prestadorId: beto.id }, "Hola")).estado === 403);
ok("otro vecino no puede escribir: 403", (await escribir(deAna, { pedidoId: otroPedido.id, clave: otroPedido.clave }, "Hola")).estado === 403);
ok("un presupuesto que no existe: 404", (await leer("no-existe", comoVecino)).estado === 404);
ok("sin decir qué presupuesto: 400", (await j("/api/chat?prestadorId=" + ana.id)).estado === 400);
ok("lo que intentaron los extraños no quedó guardado", (await leer(deAna, comoVecino)).datos.mensajes.length === 2);

// --- Sin leer ------------------------------------------------------------------------------------
const sinLeerVecino = async (ofertaId) => (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos.ofertas.find((o) => o.id === ofertaId);
const sinLeerPrestador = async (prestador, ofertaId) => (await j(`/api/ofertas?prestadorId=${prestador.id}`)).datos.ofertas.find((o) => o.id === ofertaId);
await escribir(deBeto, comoVecino, "Hola Beto, ¿podés venir hoy a la tarde?");
await escribir(deBeto, comoVecino, "Es en el barrio Alto Comedero.");
let beto1 = await sinLeerPrestador(beto, deBeto);
ok("al prestador le aparecen 2 sin leer", beto1.sinLeer === 2 && beto1.mensajes === 2, `(${beto1.sinLeer})`);
ok("al vecino no le cuentan los que mandó él", (await sinLeerVecino(deBeto)).sinLeer === 0);
ok("el otro chat no se mezcla", (await sinLeerPrestador(ana, deAna)).sinLeer === 0 && (await sinLeerVecino(deAna)).sinLeer === 0);
await leer(deBeto, { prestadorId: beto.id });
beto1 = await sinLeerPrestador(beto, deBeto);
ok("cuando el prestador abre el chat, baja a 0", beto1.sinLeer === 0, `(${beto1.sinLeer})`);
await escribir(deBeto, { prestadorId: beto.id }, "Sí, paso a las 17.");
let vecino1 = await sinLeerVecino(deBeto);
ok("al vecino le aparece 1 sin leer en ese presupuesto", vecino1.sinLeer === 1 && vecino1.mensajes === 3, `(${vecino1.sinLeer})`);
await leer(deBeto, comoVecino);
vecino1 = await sinLeerVecino(deBeto);
ok("cuando el vecino abre el chat, baja a 0", vecino1.sinLeer === 0, `(${vecino1.sinLeer})`);

// --- Teléfonos y enlaces de WhatsApp -------------------------------------------------------------
const SE_OCULTA = [
  "Llamame al 3884123456",
  "Mi número es 388 412 3456",
  "Anotá: 388-412-3456",
  "Anotá: 388.412.3456",
  "Mejor por acá +54 9 388 412-3456",
  "Mi fijo es (0388) 15 412 3456",
  "te lo paso separado 3 8 8 4 1 2 3 4 5 6",
  "El fijo de casa es 4123456",
  "Escribime a wa.me/5493884123456",
  "Entrá a https://api.whatsapp.com/send?phone=5493884123456&text=hola",
  "Tocá acá: https://wa.me/message/ABC3456DEF",
];
for (const texto of SE_OCULTA) {
  const r = await escribir(deAna, { prestadorId: ana.id }, texto);
  const guardado = r.datos?.mensaje?.texto ?? "";
  const limpio = guardado.includes(OCULTO) && !guardado.includes("3456") && !guardado.includes("4 5 6") && !guardado.toLowerCase().includes("wa.me") && !guardado.toLowerCase().includes("whatsapp");
  ok(`se oculta: ${texto}`, r.estado === 201 && r.datos.oculto === true && limpio, `-> ${guardado}`);
}
const NO_SE_TOCA = [
  "Vivo en Belgrano 1234, timbre 2",
  "Te lo dejo en 85.000",
  "Entre $25.000 y $30.000, según el repuesto",
  "Con materiales son $ 1.250.000",
  "Todo el trabajo sale 1.500.000",
  "Voy el 15 a las 10 y 30, calle Lavalle 450 piso 3",
  "El 22/11/2026 a las 18:30",
];
for (const texto of NO_SE_TOCA) {
  const r = await escribir(deAna, comoVecino, texto);
  ok(`no se toca: ${texto}`, r.estado === 201 && r.datos.oculto === false && r.datos.mensaje.texto === texto, `-> ${r.datos?.mensaje?.texto}`);
}
const mezcla = await escribir(deAna, comoVecino, "Estoy en Belgrano 1234, llamame al 388 4123456");
ok("en un mismo mensaje: queda la dirección y se oculta el teléfono", mezcla.datos.mensaje.texto === `Estoy en Belgrano 1234, llamame al ${OCULTO}` && mezcla.datos.oculto === true, `-> ${mezcla.datos?.mensaje?.texto}`);
const guardados = (await leer(deAna, { prestadorId: ana.id })).datos.mensajes.map((m) => m.texto).join(" | ");
ok("lo guardado quedó tapado para el que lee", !guardados.includes("4123456") && !guardados.includes("412 3456") && !guardados.toLowerCase().includes("wa.me"));

// --- Límites -------------------------------------------------------------------------------------
const largo = await escribir(deAna, comoVecino, "a".repeat(700));
ok("un mensaje largo se corta en 500 caracteres", largo.estado === 201 && largo.datos.mensaje.texto.length === 500, `(${largo.datos?.mensaje?.texto.length})`);
ok("un mensaje vacío se rechaza", (await escribir(deAna, comoVecino, "   ")).estado === 400);
ok("un mensaje que no es texto se rechaza", (await escribir(deAna, comoVecino, { texto: "hola" })).estado === 400);

// --- Después de elegir ---------------------------------------------------------------------------
const eleccion = await j("/api/pedido/elegir", { id, clave, ofertaId: deAna, direccion: DIRECCION, turno: turnoPara("Hoy") });
ok("el vecino elige a Ana", eleccion.estado === 200);
const coordinar = await escribir(deAna, comoVecino, "Listo Ana, te elegí. ¿Mañana a las 9?");
ok("con el elegido el chat sigue abierto", coordinar.estado === 201 && (await leer(deAna, { prestadorId: ana.id })).datos.abierto === true);
ok("el elegido responde", (await escribir(deAna, { prestadorId: ana.id }, "Dale, mañana a las 9 estoy.")).estado === 201);
const cerrado = await leer(deBeto, { prestadorId: beto.id });
ok("el descartado puede leer pero no escribir", cerrado.estado === 200 && cerrado.datos.mensajes.length === 3 && cerrado.datos.abierto === false && cerrado.datos.motivo === "descartada");
const tarde = await escribir(deBeto, { prestadorId: beto.id }, "Si cambiás de idea avisame");
ok("escribir en un presupuesto descartado: 409", tarde.estado === 409, tarde.datos?.error ?? "");
ok("el vecino tampoco puede escribirle al descartado: 409", (await escribir(deBeto, comoVecino, "Gracias igual")).estado === 409);

// --- Teléfonos fuera del chat --------------------------------------------------------------------
// Lo mismo que en el chat: un teléfono escrito en el presupuesto, el pedido o el perfil se tapa.
const conTelefono = (await j("/api/ofertas", { pedidoId: otroPedido.id, prestadorId: colado.id, precio: 30000, cuando: "Mañana", mensaje: "Llevo todo. Llamame al 388 412-3456." })).datos?.oferta;
const vistaConTelefono = (await j(`/api/pedido?id=${otroPedido.id}&clave=${otroPedido.clave}`)).datos?.ofertas?.find((o) => o.id === conTelefono?.id);
ok("el teléfono en el mensaje del presupuesto se tapa", vistaConTelefono?.mensaje === `Llevo todo. Llamame al ${OCULTO}.`, vistaConTelefono?.mensaje ?? "");
const pedidoConTelefono = (await j("/api/pedidos", { titulo: "Prueba de chat: cambiar el flexible", descripcion: "Pierde el flexible del lavatorio. Mi celu es 3884123456.", relato: "escribime al wa.me/5493884123456", rubro: "plomeria", urgencia: "semana", zona: "Alto Comedero", clienteNombre: "Vecina Telefono", cuenta: await cuentaDePrueba(U, "vecina") })).datos;
const vistoPorPrestador = (await j(`/api/pedidos?prestadorId=${colado.id}`)).datos;
const publicado = JSON.stringify((vistoPorPrestador?.pedidos ?? vistoPorPrestador ?? []).find?.((p) => p.id === pedidoConTelefono?.id) ?? null);
ok("el teléfono en la descripción y el relato del pedido se tapa", publicado.includes(OCULTO) && !publicado.includes("3884123456") && !publicado.includes("wa.me"), publicado.slice(0, 160));
const conTelefonoEnPerfil = (await j("/api/prestadores", { nombre: "Dario Perfil", rubros: ["plomeria"], zonas: ["Alto Comedero"], aniosExperiencia: 3, descripcion: "Plomero. WhatsApp 388-512-3456.", cuenta: await cuentaDePrueba(U, "prestador") })).datos?.prestador;
const perfilPublico = JSON.stringify((await j(`/api/perfil?id=${conTelefonoEnPerfil?.idPublico}`)).datos);
ok("el teléfono en la descripción del perfil se tapa", perfilPublico.includes(OCULTO) && !perfilPublico.includes("512-3456"), perfilPublico.slice(0, 160));

// --- Nada privado en las respuestas --------------------------------------------------------------
await j("/api/pedidos");
await j(`/api/pedidos?prestadorId=${beto.id}`);
await j(`/api/perfil?id=${ana.idPublico}`);
const todo = respuestas.join(" ");
ok(`en ${respuestas.length} respuestas nunca sale un teléfono`, !todo.includes("3885111222") && !todo.includes("4123456") && !todo.includes("whatsapp") && !todo.includes("clienteWhatsapp"));
const paraElVecino = JSON.stringify([(await leer(deAna, comoVecino)).datos, (await j(`/api/pedido?id=${id}&clave=${clave}`)).datos]);
ok("lo que ve el vecino no trae el id secreto de ningún prestador", ![ana, beto, colado].some((p) => paraElVecino.includes(p.id)));
const paraElPrestador = JSON.stringify([(await leer(deAna, { prestadorId: ana.id })).datos, (await j(`/api/ofertas?prestadorId=${ana.id}`)).datos]);
ok("lo que ve el prestador no trae la clave del pedido", !paraElPrestador.includes(clave) && !paraElPrestador.includes("claveCliente"));

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
