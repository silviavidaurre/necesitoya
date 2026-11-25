// Prueba el seguimiento con mapa real: la ubicación del prestador en camino. Lo importante es la privacidad:
// la manda solo el prestador elegido, solo mientras va en camino, la ve solo el vecino dueño del pedido y se borra
// al llegar o si se cancela. El mapa y el GPS del celular se prueban a mano (hace falta MAPBOX_TOKEN).
// Uso: node pruebas/mapa.mjs [url]
import { DIRECCION, cuentaDePrueba, hoyEnJujuy } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const j = async (ruta, cuerpo) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  return { estado: r.status, datos: await r.json().catch(() => null) };
};
// Un punto en Alto Comedero y otro en Buenos Aires (fuera de la zona de la app).
const EN_JUJUY = { lat: -24.2361, lng: -65.2683 };
const EN_BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 };

const config = await j("/api/mapa");
ok("el servidor dice si hay mapa real", config.estado === 200 && "token" in (config.datos ?? {}), config.datos?.token ? "(con Mapbox)" : "(mapa dibujado)");
ok("si hay token, es público (pk.)", !config.datos?.token || config.datos.token.startsWith("pk."));

const vecina = await cuentaDePrueba(U, "vecina");
const hoy = hoyEnJujuy(0);
const nuevoPedido = async (titulo) =>
  (await j("/api/pedidos", { titulo, descripcion: "Prueba del mapa", rubro: "plomeria", urgencia: "hoy", zona: "Alto Comedero", clienteNombre: "Vecina Mapa", cuenta: vecina })).datos;
const nuevoPrestador = async (nombre) =>
  (await j("/api/prestadores", { nombre, rubros: ["plomeria"], zonas: ["Alto Comedero"], aniosExperiencia: 4, descripcion: "Prueba", cuenta: await cuentaDePrueba(U, "prestador") })).datos.prestador;

const pedido = await nuevoPedido("Prueba del mapa: pierde el tanque de agua");
const elegido = await nuevoPrestador("Elegido Mapa");
const otro = await nuevoPrestador("Otro Mapa");
const oferta = (await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: elegido.id, precio: 40000, turnos: [{ dia: hoy, franja: "tarde" }], mensaje: "" })).datos.oferta;
await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: otro.id, precio: 45000, turnos: [{ dia: hoy, franja: "tarde" }], mensaje: "" });
const mandar = (punto, prestadorId = elegido.id, ofertaId = oferta.id) => j("/api/ofertas/ubicacion", { ofertaId, prestadorId, ...punto, precision: 12 });

ok("antes de elegir, nadie puede mandar ubicación", (await mandar(EN_JUJUY)).estado === 409);
await j("/api/pedido/elegir", { id: pedido.id, clave: pedido.clave, ofertaId: oferta.id, turno: { dia: hoy, franja: "tarde" }, direccion: DIRECCION });
ok("elegido pero sin salir todavía, tampoco", (await mandar(EN_JUJUY)).estado === 409);

ok("el prestador sale para allá", (await j("/api/ofertas/estado", { prestadorId: elegido.id, ofertaId: oferta.id, estado: "en_camino" })).estado === 200);
ok("otro prestador no puede mandar la ubicación de este trabajo", (await mandar(EN_JUJUY, otro.id)).estado === 403);
ok("una ubicación fuera de la zona se rechaza", (await mandar(EN_BUENOS_AIRES)).estado === 400);
ok("una ubicación que no es un número se rechaza", (await mandar({ lat: "x", lng: "y" })).estado === 400);
const primera = await mandar(EN_JUJUY);
ok("en camino, el elegido manda su ubicación", primera.estado === 200 && primera.datos?.guardada === true, `(${primera.estado})`);
ok("muy seguido no se guarda de nuevo", (await mandar({ lat: EN_JUJUY.lat + 0.001, lng: EN_JUJUY.lng })).datos?.guardada === false);

const vista = async () => (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`)).datos?.ofertas?.find((o) => o.id === oferta.id);
const enCamino = await vista();
ok("el vecino ve dónde está el prestador", enCamino?.trabajo?.ubicacion?.lat === EN_JUJUY.lat && enCamino.trabajo.ubicacion.lng === EN_JUJUY.lng);
const ajeno = JSON.stringify([(await j("/api/pedidos")).datos, (await j(`/api/pedidos?prestadorId=${otro.id}`)).datos, (await j(`/api/ofertas?prestadorId=${otro.id}`)).datos]);
ok("nadie más la ve (lista de pedidos, otro prestador)", !ajeno.includes(String(EN_JUJUY.lat)) && !ajeno.includes("ubicacion"));

ok("el prestador llega", (await j("/api/ofertas/estado", { prestadorId: elegido.id, ofertaId: oferta.id, estado: "llego" })).estado === 200);
const llego = await vista();
ok("al llegar, la ubicación se borra", llego?.trabajo?.estado === "llego" && llego.trabajo.ubicacion === undefined);
ok("y ya no se puede mandar", (await mandar(EN_JUJUY)).estado === 409);
const propia = (await j(`/api/ofertas?prestadorId=${elegido.id}`)).datos?.ofertas?.find((o) => o.id === oferta.id);
ok("el prestador tampoco la sigue recibiendo", propia && !JSON.stringify(propia).includes("ubicacion"));

// Si se cancela en camino, también se borra.
const segundo = await nuevoPedido("Prueba del mapa: segundo pedido para cancelar");
const ofertaDos = (await j("/api/ofertas", { pedidoId: segundo.id, prestadorId: otro.id, precio: 30000, turnos: [{ dia: hoy, franja: "noche" }], mensaje: "" })).datos.oferta;
await j("/api/pedido/elegir", { id: segundo.id, clave: segundo.clave, ofertaId: ofertaDos.id, turno: { dia: hoy, franja: "noche" }, direccion: DIRECCION });
await j("/api/ofertas/estado", { prestadorId: otro.id, ofertaId: ofertaDos.id, estado: "en_camino" });
ok("el segundo prestador manda su ubicación en camino", (await mandar(EN_JUJUY, otro.id, ofertaDos.id)).datos?.guardada === true);
ok("el vecino cancela", (await j("/api/pedido/cancelar", { id: segundo.id, clave: segundo.clave, motivo: "Ya lo resolví" })).estado === 200);
const cancelada = (await j(`/api/ofertas?prestadorId=${otro.id}`)).datos?.ofertas?.find((o) => o.id === ofertaDos.id);
ok("cancelado, la ubicación ya no está", cancelada && !JSON.stringify(cancelada).includes("ubicacion"));
ok("y no se puede mandar más", (await mandar(EN_JUJUY, otro.id, ofertaDos.id)).estado === 409);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
