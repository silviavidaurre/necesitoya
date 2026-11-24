// Prueba los avisos web push y la app instalable: suscribirse, que se guarde el aviso y que el service worker
// lo pueda traer, y que el manifiesto y el service worker se sirvan sin romper la API.
// Uso: node pruebas/avisos.mjs [url]
// El push real a un celular no se puede probar acá (hace falta un navegador suscripto): se prueba a mano.
import { cuentaDePrueba } from "./comun.mjs";

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

// --- App instalable ------------------------------------------------------------------------------
const manifiesto = await fetch(`${U}/manifest.webmanifest`);
const datosDelManifiesto = await manifiesto.json().catch(() => null);
ok("se sirve el manifiesto", manifiesto.status === 200 && datosDelManifiesto?.display === "standalone" && datosDelManifiesto.icons.length >= 3);
for (const icono of datosDelManifiesto?.icons ?? []) {
  const r = await fetch(U + icono.src);
  ok(`se sirve ${icono.src}`, r.status === 200 && (r.headers.get("content-type") ?? "").includes("png"));
}
const sw = await fetch(`${U}/sw.js`);
const textoSw = await sw.text();
ok("se sirve el service worker", sw.status === 200 && /javascript/.test(sw.headers.get("content-type") ?? "") && textoSw.includes("/api/"));
ok("el service worker no guarda nada de la API", textoSw.includes('url.pathname.startsWith("/api/")) return'));
const inicio = await (await fetch(`${U}/`)).text();
ok("la página enlaza el manifiesto", inicio.includes('rel="manifest"'));
ok("la API sigue respondiendo JSON", (await j("/api/stats")).estado === 200);

// --- Avisos --------------------------------------------------------------------------------------
const config = await j("/api/avisos");
ok("el servidor dice si hay avisos", config.estado === 200 && "disponible" in config.datos, config.datos?.disponible ? "(disponibles)" : "(sin claves VAPID)");
if (config.datos?.disponible) {
  ok("da la clave pública", typeof config.datos.publica === "string" && config.datos.publica.length > 80);
  const cuenta = await cuentaDePrueba(U, "vecina");
  const endpoint = `https://fcm.googleapis.com/fcm/send/prueba-${crypto.randomUUID()}`;
  ok("un endpoint de un servicio desconocido se rechaza", (await j("/api/avisos", { cuenta, suscripcion: { endpoint: "https://ejemplo.com/push" } })).estado === 400);
  ok("sin cuenta no se anota", (await j("/api/avisos", { suscripcion: { endpoint } })).estado === 401);
  ok("con cuenta se anota el celular", (await j("/api/avisos", { cuenta, suscripcion: { endpoint } })).estado === 201);

  // Llega un presupuesto: se guarda el aviso para la cuenta del vecino.
  const pedido = (await j("/api/pedidos", { titulo: "Prueba de avisos: cambiar un enchufe", descripcion: "Prueba", rubro: "electricidad", urgencia: "semana", zona: "Centro", clienteNombre: "Vecina Avisos", cuenta })).datos;
  const prestador = (await j("/api/prestadores", { nombre: "Electricista Avisos", rubros: ["electricidad"], zonas: ["Centro"], cuenta: await cuentaDePrueba(U, "prestador") })).datos.prestador;
  await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: prestador.id, precio: 30000, cuando: "Mañana", mensaje: "" });
  let aviso = null;
  for (let intento = 0; intento < 10 && !aviso; intento++) {
    await new Promise((listo) => setTimeout(listo, 300));
    aviso = (await j("/api/avisos/ultimo", { endpoint })).datos?.aviso;
  }
  ok("el service worker trae el aviso del presupuesto nuevo", aviso?.tipo === "presupuesto" && aviso.url === `/pedido/${pedido.id}`, JSON.stringify(aviso));
  ok("con un endpoint que no es de nadie no trae nada", (await j("/api/avisos/ultimo", { endpoint: `https://fcm.googleapis.com/fcm/send/otro-${crypto.randomUUID()}` })).datos?.aviso === null);
  ok("el celular se puede quitar", (await j("/api/avisos", { quitar: endpoint })).estado === 200);
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
