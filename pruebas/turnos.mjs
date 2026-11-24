// Prueba el trabajo "tipo Uber": el prestador ofrece días y franjas, el vecino elige uno y carga la dirección,
// el prestador avanza los estados y el vecino los ve. Lo más importante: la dirección es privada.
// Solo la ven el vecino y el prestador elegido, y este solo mientras el trabajo está activo.
// Uso: node pruebas/turnos.mjs [url]
import { DIRECCION, cuentaDePrueba, hoyEnJujuy, png } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
// Cada respuesta se guarda con quién la pidió: al final se revisa que la dirección solo la hayan recibido el vecino
// dueño del pedido y el prestador elegido (con el trabajo activo).
const respuestas = [];
const j = async (ruta, cuerpo, quien = "otro") => {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
      const datos = await r.json().catch(() => null);
      respuestas.push({ quien, ruta, texto: JSON.stringify(datos) });
      return { estado: r.status, datos };
    } catch (error) {
      if (intento >= 3) throw error;
    }
  }
};
const tieneDireccion = (texto) => texto.includes(DIRECCION.calle) || texto.includes(DIRECCION.referencia);

const hoy = hoyEnJujuy(0);
const manana = hoyEnJujuy(1);
const vecina = await cuentaDePrueba(U, "vecina");
const nuevoPedido = async (titulo) =>
  (await j("/api/pedidos", { titulo, descripcion: "Prueba de turnos", rubro: "electricidad", urgencia: "hoy", zona: "Centro", precioMin: 30000, precioMax: 60000, clienteNombre: "Vecina Turnos", cuenta: vecina }, "vecino")).datos;
const nuevoPrestador = async (nombre) =>
  (await j("/api/prestadores", { nombre, rubros: ["electricidad"], zonas: ["Centro"], aniosExperiencia: 6, descripcion: "Prueba", cuenta: await cuentaDePrueba(U, "prestador") }, "propio")).datos.prestador;

const pedido = await nuevoPedido("Prueba de turnos: cambiar un tomacorriente");
const elegido = await nuevoPrestador("Elegido Turnos");
const otro = await nuevoPrestador("Otro Turnos");

// --- Presupuestar con días y franjas ----------------------------------------------------------------
const turnosOfrecidos = [{ dia: hoy, franja: "tarde" }, { dia: manana, franja: "manana" }, { dia: "1999-01-01", franja: "tarde" }, { dia: hoy, franja: "madrugada" }];
const oferta = await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: elegido.id, precio: 45000, turnos: turnosOfrecidos, mensaje: "" }, elegido.id);
ok("presupuesta ofreciendo días y franjas", oferta.estado === 201, oferta.datos?.error ?? "");
ok("se guardan solo los turnos válidos", oferta.datos.oferta.turnos?.length === 2, JSON.stringify(oferta.datos.oferta.turnos));
ok("arma el resumen en palabras", /hoy/i.test(oferta.datos.oferta.cuando), oferta.datos.oferta.cuando);
const viejo = await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: otro.id, precio: 50000, cuando: "Mañana", mensaje: "" }, otro.id);
ok("una app vieja que manda solo 'Mañana' igual presupuesta, con turnos de mañana", viejo.estado === 201 && viejo.datos.oferta.turnos.every((t) => t.dia === manana));

// --- Elegir: turno entre los ofrecidos y dirección --------------------------------------------------
const elegir = (extra) => j("/api/pedido/elegir", { id: pedido.id, clave: pedido.clave, ofertaId: oferta.datos.oferta.id, ...extra }, "vecino");
ok("sin dirección no se puede elegir", (await elegir({ turno: { dia: hoy, franja: "tarde" } })).estado === 400);
ok("con un turno que no ofreció no se puede elegir", (await elegir({ turno: { dia: manana, franja: "noche" }, direccion: DIRECCION })).estado === 400);
const eleccion = await elegir({ turno: { dia: manana, franja: "manana" }, direccion: DIRECCION });
ok("elige día, franja y dirección", eleccion.estado === 200, eleccion.datos?.error ?? "");
const enSeguimiento = eleccion.datos.ofertas.find((o) => o.estado === "elegida");
ok("el trabajo arranca Confirmado con el turno elegido", enSeguimiento?.trabajo?.estado === "confirmado" && enSeguimiento.trabajo.turno?.dia === manana && enSeguimiento.trabajo.turno?.franja === "manana");
ok("el vecino ve su dirección", eleccion.datos.direccion?.calle === DIRECCION.calle);

// --- Quién ve la dirección -------------------------------------------------------------------------
const delElegido = (await j(`/api/ofertas?prestadorId=${elegido.id}`, undefined, elegido.id)).datos.ofertas[0];
ok("el prestador elegido ve la dirección mientras el trabajo está activo", delElegido?.direccion?.calle === DIRECCION.calle && delElegido.direccion.referencia === DIRECCION.referencia);
const delOtro = (await j(`/api/ofertas?prestadorId=${otro.id}`, undefined, otro.id)).datos.ofertas[0];
ok("el prestador que no fue elegido no la ve", delOtro?.estado === "descartada" && !tieneDireccion(JSON.stringify(delOtro)));
await j("/api/pedidos", undefined, "otro");
await j(`/api/pedidos?prestadorId=${otro.id}`, undefined, otro.id);
await j(`/api/perfil?id=${elegido.idPublico}`, undefined, "otro");
await j(`/api/chat?ofertaId=${oferta.datos.oferta.id}&prestadorId=${elegido.id}`, undefined, "chat");
await j(`/api/chat?ofertaId=${oferta.datos.oferta.id}&pedidoId=${pedido.id}&clave=${pedido.clave}`, undefined, "chat");

// --- Estados ---------------------------------------------------------------------------------------
const avanzar = (estado, prestadorId = elegido.id) => j("/api/ofertas/estado", { prestadorId, ofertaId: oferta.datos.oferta.id, estado }, prestadorId);
ok("no se puede saltar un paso", (await avanzar("llego")).estado === 409);
ok("otro prestador no puede avanzar el trabajo", (await avanzar("en_camino", otro.id)).estado === 403);
ok("con el trabajo confirmado se puede reprogramar", (await j("/api/ofertas/dia", { ofertaId: oferta.datos.oferta.id, pedidoId: pedido.id, clave: pedido.clave, turno: { dia: hoy, franja: "tarde" } }, "vecino")).estado === 200);
ok("el prestador sale: En camino", (await avanzar("en_camino")).estado === 200);
const enCamino = (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`, undefined, "vecino")).datos.ofertas.find((o) => o.estado === "elegida");
ok("el vecino ve En camino y el nuevo turno", enCamino?.trabajo?.estado === "en_camino" && enCamino.trabajo.turno?.dia === hoy && enCamino.trabajo.historial.length >= 2);
ok("en camino ya no se reprograma", (await j("/api/ofertas/dia", { ofertaId: oferta.datos.oferta.id, pedidoId: pedido.id, clave: pedido.clave, turno: { dia: manana, franja: "manana" } }, "vecino")).estado === 409);
ok("llegó", (await avanzar("llego")).estado === 200);
ok("con el prestador en la casa ya no se cancela", (await j("/api/pedido/cancelar", { id: pedido.id, clave: pedido.clave, motivo: "Prueba" }, "vecino")).estado === 409);
ok("trabajando", (await avanzar("trabajando")).estado === 200);
ok("terminado no se marca sin la foto del después", (await avanzar("terminado")).estado === 409);
const terminado = await j("/api/ofertas/terminar", { prestadorId: elegido.id, ofertaId: oferta.datos.oferta.id, foto: { tipo: "image/png", base64: png(70) } }, elegido.id);
ok("con la foto queda terminado", terminado.estado === 200);
const despues = (await j(`/api/ofertas?prestadorId=${elegido.id}`, undefined, "terminado")).datos.ofertas[0];
ok("terminado el trabajo, el prestador ya no ve la dirección", despues?.trabajo?.estado === "terminado" && despues.direccion === null && !tieneDireccion(JSON.stringify(despues)));
ok("ni puede volver a avanzar", (await avanzar("en_camino")).estado === 409);
await j("/api/pedido/confirmar", { id: pedido.id, clave: pedido.clave }, "vecino");
const confirmado = (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`, undefined, "confirmado")).datos;
ok("confirmado el trabajo, la dirección se borra", confirmado.direccion === null && !tieneDireccion(JSON.stringify(confirmado)));

// --- Cancelado: la dirección desaparece -------------------------------------------------------------
const segundo = await nuevoPedido("Prueba de turnos: segundo pedido para cancelar");
const ofertaDos = await j("/api/ofertas", { pedidoId: segundo.id, prestadorId: otro.id, precio: 40000, turnos: [{ dia: hoy, franja: "noche" }], mensaje: "" }, otro.id);
await j("/api/pedido/elegir", { id: segundo.id, clave: segundo.clave, ofertaId: ofertaDos.datos.oferta.id, turno: { dia: hoy, franja: "noche" }, direccion: DIRECCION }, "vecino");
const antesDeCancelar = (await j(`/api/ofertas?prestadorId=${otro.id}`, undefined, otro.id)).datos.ofertas.find((o) => o.id === ofertaDos.datos.oferta.id);
ok("el elegido del segundo pedido ve la dirección", antesDeCancelar?.direccion?.calle === DIRECCION.calle);
ok("en camino se puede cancelar", (await j("/api/ofertas/estado", { prestadorId: otro.id, ofertaId: ofertaDos.datos.oferta.id, estado: "en_camino" }, otro.id)).estado === 200);
ok("el vecino cancela", (await j("/api/pedido/cancelar", { id: segundo.id, clave: segundo.clave, motivo: "Ya lo resolví" }, "vecino")).estado === 200);
const cancelada = (await j(`/api/ofertas?prestadorId=${otro.id}`, undefined, "cancelado")).datos.ofertas.find((o) => o.id === ofertaDos.datos.oferta.id);
ok("cancelado el pedido, el prestador ya no ve la dirección", cancelada && cancelada.direccion === null && !tieneDireccion(JSON.stringify(cancelada)));

// --- Repaso de todas las respuestas ---------------------------------------------------------------
// La dirección solo puede haber llegado al vecino (dueño) y a cada prestador elegido mientras su trabajo estaba activo.
const indebidas = respuestas.filter((r) => tieneDireccion(r.texto) && r.quien !== "vecino" && r.quien !== elegido.id && r.quien !== otro.id);
ok(`en ${respuestas.length} respuestas la dirección solo llegó a quien correspondía`, indebidas.length === 0, indebidas.map((r) => `${r.quien} ${r.ruta}`).join(", "));
const delDescartado = respuestas.filter((r) => r.quien === otro.id && r.ruta.startsWith("/api/ofertas?") && r.texto.includes(oferta.datos.oferta.id) && tieneDireccion(r.texto));
ok("el prestador descartado nunca recibió la dirección del primer pedido", delDescartado.length === 0);
// El perfil propio (al anotarse) trae el campo del celular de uno mismo: no cuenta.
const todo = respuestas.filter((r) => r.quien !== "propio").map((r) => r.texto).join(" ");
ok("ninguna respuesta trae mails ni teléfonos", !todo.includes("@necesitoya.test") && !/whatsapp/i.test(todo));

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
