// Prueba el barrio de demostración (src/lib/demo.ts): que se cargue desde el panel, que las cuentas demo vean todo,
// que no cuente en los números públicos y que no se cruce con lo real.
// Uso: node pruebas/demo.mjs [url]   (hace falta ADMIN_SECRET en el entorno o en .env.local; no se imprime)
// Deja el barrio demo cargado y recién recargado. Las cuentas de prueba (.test) se borran con pruebas/limpiar.mjs.
import { cuentaDePrueba, secretoLocal } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
const ADMIN = secretoLocal("ADMIN_SECRET");
if (!ADMIN) {
  console.log("Falta ADMIN_SECRET: no se puede cargar el barrio demo.");
  process.exit(1);
}
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const j = async (ruta, cuerpo, cabeceras = {}) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json", ...cabeceras }, body: JSON.stringify(cuerpo) } : { headers: cabeceras, redirect: "manual" });
  return { estado: r.status, datos: await r.json().catch(() => null), cabeceras: r.headers };
};
const admin = (cuerpo) => j("/api/admin", cuerpo, { "x-admin": ADMIN });
const numeros = async () => {
  const { prestadores, pedidos, ofertas } = (await j("/api/stats")).datos ?? {};
  return JSON.stringify({ prestadores, pedidos, ofertas });
};
const CONTRASENA = "demo2026";

// --- Cargar ---------------------------------------------------------------------------------------
const antes = await numeros();
ok("sin confirmar no se carga", (await admin({ accion: "cargar-demo" })).estado === 400);
const carga = await admin({ accion: "cargar-demo", confirmar: true });
ok("el panel carga el barrio demo", carga.estado === 200 && carga.datos?.demo?.prestadores >= 8 && carga.datos.demo.pedidos >= 20, JSON.stringify(carga.datos?.demo ?? carga.datos));
ok("el barrio demo no cambia los números públicos", (await numeros()) === antes, `${antes}`);
ok("el panel dice cuánto hay", (await j("/api/admin?seccion=demo", undefined, { "x-admin": ADMIN })).datos?.demo?.cuentas === 2);

// --- La vecina de demostración --------------------------------------------------------------------
const vecina = await j("/api/cuenta", { email: "vecina@necesitoya.demo", contrasena: CONTRASENA });
ok("la vecina demo entra con la contraseña pública", vecina.estado === 200 && vecina.datos?.demo === true && vecina.datos.pedidos?.length >= 5, `(${vecina.estado})`);
const susPedidos = await Promise.all((vecina.datos?.pedidos ?? []).map(async (p) => (await j(`/api/pedido?id=${p.id}&clave=${p.clave}`)).datos));
const estados = susPedidos.map((d) => {
  const elegida = d?.ofertas?.find((o) => o.estado === "elegida");
  if (!elegida) return d?.pedido?.estado === "abierto" && d.ofertas?.length >= 3 ? "abierto-con-3" : "otro";
  if (d.pedido?.calificacion) return "calificado";
  return elegida.trabajo?.estado ?? "elegido";
});
for (const esperado of ["abierto-con-3", "en_camino", "trabajando", "calificado"]) ok(`tiene un pedido ${esperado}`, estados.includes(esperado), estados.join(","));
const conChat = susPedidos.flatMap((d) => d?.ofertas ?? []).filter((o) => o.mensajes > 0).length;
ok("hay chats en sus pedidos", conChat >= 3, `(${conChat})`);
ok("la cuenta demo no se puede eliminar", (await j("/api/cuenta/eliminar", { cuenta: vecina.datos?.clave, confirmar: true })).estado === 409);

// --- El prestador de demostración -----------------------------------------------------------------
const prestador = await j("/api/cuenta", { email: "prestador@necesitoya.demo", contrasena: CONTRASENA });
ok("el prestador demo entra y tiene su perfil", prestador.estado === 200 && typeof prestador.datos?.prestadorId === "string");
const idDemo = prestador.datos?.prestadorId;
const suyas = (await j(`/api/ofertas?prestadorId=${idDemo}`)).datos?.ofertas ?? [];
ok("ve sus presupuestos: uno elegido en camino y otros esperando", suyas.some((o) => o.estado === "elegida" && o.trabajo?.estado === "en_camino") && suyas.some((o) => o.estado === "enviada"), `(${suyas.length})`);
const feedDemo = (await j(`/api/pedidos?prestadorId=${idDemo}`)).datos?.pedidos ?? [];
ok("ve pedidos para presupuestar, todos del barrio demo", feedDemo.length >= 3 && feedDemo.every((p) => p.demo === true), `(${feedDemo.length})`);
const perfilDemo = (await j(`/api/perfil?id=${(await j(`/api/prestadores?id=${idDemo}`)).datos?.prestador?.idPublico}`)).datos?.perfil;
ok("su perfil público dice que es de demostración, con reseñas y fotos", perfilDemo?.demo === true && perfilDemo.resenas?.length >= 2 && perfilDemo.fotos?.length >= 2);
const foto = await j(`/api/fotos?id=${perfilDemo?.fotos?.[0]}`);
ok("las fotos de trabajos son ilustraciones fijas", foto.estado === 302 && /^\/demo\/demo-[a-z]+-\d[.]svg$/.test(foto.cabeceras.get("location") ?? ""));
const svg = await fetch(`${U}${foto.cabeceras.get("location")}`);
ok("la ilustración se sirve", svg.status === 200 && (svg.headers.get("content-type") ?? "").includes("svg"));

// --- No se cruza con lo real ----------------------------------------------------------------------
const real = (await j("/api/prestadores", { nombre: "Plomero Real Demo", rubros: ["plomeria"], zonas: ["Alto Comedero"], aniosExperiencia: 5, descripcion: "Prueba", cuenta: await cuentaDePrueba(U, "prestador") })).datos?.prestador;
const feedReal = (await j(`/api/pedidos?prestadorId=${real?.id}`)).datos?.pedidos ?? [];
ok("un prestador real no ve pedidos demo", feedReal.every((p) => !p.demo), `(${feedReal.filter((p) => p.demo).length} demo)`);
const pedidoDemo = feedDemo.find((p) => p.cupos > 0 && !p.yaOferte);
ok("un prestador real no puede presupuestar un pedido demo", (await j("/api/ofertas", { pedidoId: pedidoDemo?.id, prestadorId: real?.id, precio: 30000, cuando: "Mañana", mensaje: "" })).estado === 404);
const pedidoReal = (await j("/api/pedidos", { titulo: "Prueba demo: cambiar una canilla", descripcion: "Prueba", rubro: "plomeria", urgencia: "semana", zona: "Alto Comedero", clienteNombre: "Vecina Real", cuenta: await cuentaDePrueba(U, "vecina") })).datos;
ok("el prestador demo no ve pedidos reales", !((await j(`/api/pedidos?prestadorId=${idDemo}`)).datos?.pedidos ?? []).some((p) => p.id === pedidoReal?.id));
ok("el prestador demo no puede presupuestar un pedido real", (await j("/api/ofertas", { pedidoId: pedidoReal?.id, prestadorId: idDemo, precio: 30000, cuando: "Mañana", mensaje: "" })).estado === 404);

// Lo que pide la vecina demo queda en el barrio demo y no cuenta.
const antesDelPedido = await numeros();
const nuevo = (await j("/api/pedidos", { titulo: "Prueba demo: arreglar una persiana", descripcion: "Prueba", rubro: "otros", urgencia: "semana", zona: "Alto Comedero", clienteNombre: "Carla", cuenta: vecina.datos?.clave })).datos;
ok("un pedido nuevo de la vecina demo no cuenta en los números", nuevo?.id && (await numeros()) === antesDelPedido);
ok("y solo lo ven los prestadores demo", ((await j(`/api/pedidos?prestadorId=${idDemo}`)).datos?.pedidos ?? []).some((p) => p.id === nuevo?.id) && !((await j(`/api/pedidos?prestadorId=${real?.id}`)).datos?.pedidos ?? []).some((p) => p.id === nuevo?.id));

// --- Recargar -------------------------------------------------------------------------------------
const recarga = await admin({ accion: "cargar-demo", confirmar: true });
ok("se vuelve a cargar con fechas de hoy", recarga.estado === 200);
const otraVez = await j("/api/cuenta", { email: "vecina@necesitoya.demo", contrasena: CONTRASENA });
ok("la sesión de la vecina demo sigue valiendo después de recargar", otraVez.datos?.clave === vecina.datos?.clave);
ok("lo que se había creado con la cuenta demo se fue", !(otraVez.datos?.pedidos ?? []).some((p) => p.id === nuevo?.id));
ok("después de recargar, los números públicos siguen iguales", (await numeros()) === antesDelPedido);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
