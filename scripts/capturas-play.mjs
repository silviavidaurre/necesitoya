// Capturas para la ficha de Google Play (1080x1920) y el gráfico destacado (1024x500), sacadas de la app real.
// Corre contra la app en desarrollo (npm run dev) con datos de ejemplo que carga acá mismo: personas inventadas
// (las mismas de los presupuestos de muestra), sin reseñas ni números de uso inventados.
// Uso: node scripts/capturas-play.mjs <carpeta de salida> [url]   (por defecto http://localhost:3000)
// Necesita Chrome instalado y ADMIN_SECRET en .env.local (para marcar a dos prestadores como verificados).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const SALIDA = process.argv[2];
const U = process.argv[3] ?? "http://localhost:3000";
if (!SALIDA) {
  console.log("Uso: node scripts/capturas-play.mjs <carpeta de salida> [url]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));

// --- Datos de ejemplo ---------------------------------------------------------------------------------
const api = async (ruta, cuerpo, admin = false) => {
  const r = await fetch(U + ruta, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(admin ? { "x-admin": env.ADMIN_SECRET } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${datos?.error ?? ""}`);
  return datos;
};
const cuenta = async (nombre) => (await api("/api/cuenta", { email: `capturas-${nombre}-${crypto.randomUUID().slice(0, 8)}@necesitoya.test`, contrasena: crypto.randomUUID() })).clave;
function png(gris) {
  const tabla = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  const crc = (b) => {
    let x = 0xffffffff;
    for (const v of b) x = tabla[(x ^ v) & 255] ^ (x >>> 8);
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: 64 }, () => fila)))), trozo("IEND", Buffer.alloc(0))]).toString("base64");
}
const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const manana = new Date(Date.now() + 21 * 3600_000).toISOString().slice(0, 10);

console.log("Cargando datos de ejemplo…");
const vecino = await cuenta("vecina");
const RELATO = "Se me rompió el termotanque, pierde agua por abajo y no calienta nada. Lo necesito para hoy.";
const armado = (await api("/api/ia/pedido", { texto: RELATO })).pedido;
const pedido = await api("/api/pedidos", { ...armado, zona: "Alto Comedero", relato: RELATO, clienteNombre: "Carla", cuenta: vecino });
const prestadores = [];
for (const [nombre, verificado] of [
  ["Ramón Quispe", true],
  ["Marta Flores", true],
  ["Daniel Cruz", false],
]) {
  const p = (await api("/api/prestadores", { nombre, rubros: ["plomeria", "gas"], zonas: ["Alto Comedero"], aniosExperiencia: 10, descripcion: "Plomería y gas.", cuenta: await cuenta("prestador") })).prestador;
  if (verificado) await api("/api/verificacion", { prestadorId: p.id, tipo: "dni", documentos: [{ tipo: "image/png", base64: png(40) }, { tipo: "image/png", base64: png(80) }] });
  prestadores.push(p);
}
const pendientes = (await api("/api/admin?seccion=verificaciones", undefined, true)).verificaciones;
for (const v of pendientes.filter((v) => prestadores.some((p) => p.idPublico === v.prestador.idPublico))) await api("/api/admin", { accion: "verificacion", id: v.id, aprobar: true }, true);
const precios = [78000, 72000, 89000];
const turnos = [
  [{ dia: hoy, franja: "tarde" }, { dia: hoy, franja: "noche" }, { dia: manana, franja: "manana" }],
  [{ dia: manana, franja: "manana" }, { dia: manana, franja: "tarde" }],
  [{ dia: hoy, franja: "noche" }],
];
const mensajes = ["Llevo la válvula y el flexible. Lo dejo andando en el día.", "Puedo mañana temprano. Incluye la mano de obra.", ""];
for (const [i, p] of prestadores.entries()) await api("/api/ofertas", { pedidoId: pedido.id, prestadorId: p.id, precio: precios[i], turnos: turnos[i], mensaje: mensajes[i] });

// Otro pedido, ya elegido y con el prestador en camino, para el seguimiento en vivo.
const otro = await api("/api/pedidos", { ...armado, zona: "Alto Comedero", relato: RELATO, clienteNombre: "Carla", cuenta: vecino });
const ofertaOtro = (await api("/api/ofertas", { pedidoId: otro.id, prestadorId: prestadores[0].id, precio: 78000, turnos: turnos[0], mensaje: "" })).oferta;
await api("/api/pedido/elegir", { id: otro.id, clave: otro.clave, ofertaId: ofertaOtro.id, turno: turnos[0][0], direccion: { calle: "Calle de ejemplo 123", referencia: "" } });
await api("/api/ofertas/estado", { prestadorId: prestadores[0].id, ofertaId: ofertaOtro.id, estado: "en_camino" });

// --- Chrome sin ventana, por su protocolo de depuración -------------------------------------------
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PUERTO = 9333;
// El perfil de Chrome va a una carpeta temporal (con la carpeta de salida no arrancaba, y así no deja basura ahí).
const perfil = path.join(os.tmpdir(), `necesitoya-capturas-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, "--hide-scrollbars", "--no-first-run", "--disable-extensions", "--lang=es-AR", "about:blank"], { stdio: "ignore" });
let pagina;
for (let i = 0; i < 120 && !pagina; i++) {
  await espera(500);
  pagina = await fetch(`http://127.0.0.1:${PUERTO}/json/list`)
    .then((r) => r.json())
    .then((l) => l.find((t) => t.type === "page"))
    .catch(() => null);
}
if (!pagina) throw new Error("Chrome no abrió el puerto de depuración.");
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((listo) => ws.addEventListener("open", listo));
let siguiente = 0;
const pendientesCdp = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientesCdp.has(m.id)) {
    pendientesCdp.get(m.id)(m.result ?? m.error);
    pendientesCdp.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((listo) => {
    const id = ++siguiente;
    pendientesCdp.set(id, listo);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluar = async (expresion) => (await cdp("Runtime.evaluate", { expression: expresion, awaitPromise: true, returnByValue: true })).result?.value;
const ir = async (ruta) => {
  await cdp("Page.navigate", { url: U + ruta });
  await espera(3500);
};
const esperarTexto = async (texto, ms = 60_000) => {
  for (let t = 0; t < ms; t += 500) {
    if (await evaluar(`document.body.innerText.includes(${JSON.stringify(texto)})`)) return;
    await espera(500);
  }
  throw new Error(`No apareció: ${texto}`);
};
const tocar = (texto) => evaluar(`[...document.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(texto)}))?.click()`);
const capturar = async (nombre) => {
  await espera(900);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(data, "base64"));
  console.log("  ", nombre);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });

console.log("Sacando capturas…");
await ir("/");
const recordado = {
  "necesitoya.cuenta": { nombre: "Carla", clave: vecino },
  "necesitoya.misDatos": { zona: "Alto Comedero", nombre: "Carla" },
  "necesitoya.misPedidos": [
    { id: pedido.id, clave: pedido.clave, titulo: armado.titulo, creado: new Date().toISOString() },
    { id: otro.id, clave: otro.clave, titulo: armado.titulo, creado: new Date().toISOString() },
  ],
};
await evaluar(`(${JSON.stringify(recordado)}) && Object.entries(${JSON.stringify(recordado)}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)))`);
await evaluar("localStorage.removeItem('necesitoya.prestadorId'); localStorage.removeItem('necesitoya.misPedidos'); true");

await ir("/");
await capturar("01-inicio");

await ir(`/pedir?texto=${encodeURIComponent(RELATO)}`);
await tocar("Continuar");
await esperarTexto("¿Está bien así?");
await capturar("02-pedido-armado");
await evaluar("document.querySelector('[aria-label=\"Diagnóstico orientativo\"]')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); true");
await capturar("03-diagnostico");

await evaluar(`localStorage.setItem('necesitoya.misPedidos', ${JSON.stringify(JSON.stringify(recordado["necesitoya.misPedidos"]))}); true`);
await ir(`/pedido/${pedido.id}`);
await esperarTexto("Elegí presupuesto");
await capturar("04-presupuestos");
await tocar("Elegir a");
await esperarTexto("¿Cuándo?");
await capturar("05-dia-y-direccion");

await ir(`/pedido/${otro.id}`);
await esperarTexto("En camino");
await capturar("06-seguimiento-en-vivo");

await evaluar(`localStorage.setItem('necesitoya.prestadorId', ${JSON.stringify(prestadores[0].id)}); true`);
await ir("/prestador/ofertas");
await esperarTexto("Llegué");
await capturar("07-prestador-trabajo-en-curso");

// --- Gráfico destacado (1024x500) -----------------------------------------------------------------
await cdp("Emulation.setDeviceMetricsOverride", { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
const grafico = path.resolve("scripts/grafico-destacado.html").replace(/\\/g, "/");
await cdp("Page.navigate", { url: `file:///${grafico}` });
await espera(2500);
await capturar("grafico-destacado-1024x500");

ws.close();
chrome.kill();
console.log(`Listo en ${SALIDA}`);
