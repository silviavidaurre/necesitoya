// Prueba del módulo de voz contra un servidor (local o publicado): leer en voz alta y pasar audio a texto.
// Uso: node pruebas/voz.mjs [url]   (por defecto http://localhost:3000)
// No crea datos. Gasta unos 400 caracteres de voz y unos 20 segundos de transcripción por corrida.
const U = process.argv[2] ?? "http://localhost:3000";

// Con mala señal la conexión a veces no llega a abrirse: se reintenta solo en ese caso.
async function pedir(ruta, cuerpo) {
  for (let intento = 1; ; intento++) {
    try {
      return await fetch(U + ruta, cuerpo === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    } catch (error) {
      if (intento >= 4 || error?.cause?.code !== "UND_ERR_CONNECT_TIMEOUT") throw error;
    }
  }
}
const json = async (ruta, cuerpo) => {
  const r = await pedir(ruta, cuerpo);
  return { estado: r.status, datos: await r.json().catch(() => null) };
};

let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};

// Para comparar lo que se mandó a leer con lo que volvió transcripto: sin acentos, signos ni mayúsculas.
const palabras = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
function parecido(original, oido) {
  const esperadas = palabras(original);
  const oidas = new Set(palabras(oido));
  return esperadas.filter((p) => oidas.has(p)).length / esperadas.length;
}

const estado = await json("/api/voz");
ok("el servidor informa si hay voz", estado.estado === 200 && typeof estado.datos?.voz === "boolean", JSON.stringify(estado.datos));
const stats = await json("/api/stats");
ok("stats incluye voz", stats.estado === 200 && stats.datos?.voz === estado.datos?.voz, `voz: ${stats.datos?.voz}`);

// --- Validaciones: no dependen de ElevenLabs ---
const vacio = await json("/api/voz/decir", { texto: "   " });
ok("decir rechaza texto vacío", vacio.estado === 400, vacio.datos?.error);
const sinTexto = await json("/api/voz/decir", {});
ok("decir rechaza pedido sin texto", sinTexto.estado === 400, sinTexto.datos?.error);
const largo = await json("/api/voz/decir", { texto: "palabra ".repeat(80) });
ok("decir rechaza texto demasiado largo", largo.estado === 413, largo.datos?.error);
const porGet = await pedir("/api/voz/decir");
ok("decir no acepta GET", porGet.status === 405);

const base64Valido = Buffer.alloc(600, 1).toString("base64");
const tipoMalo = await json("/api/voz/transcribir", { tipo: "image/png", base64: base64Valido });
ok("transcribir rechaza un tipo que no es audio", tipoMalo.estado === 400, tipoMalo.datos?.error);
const sinTipo = await json("/api/voz/transcribir", { base64: base64Valido });
ok("transcribir rechaza audio sin tipo", sinTipo.estado === 400, sinTipo.datos?.error);
const base64Malo = await json("/api/voz/transcribir", { tipo: "audio/webm;codecs=opus", base64: "esto no es base64 !!".repeat(20) });
ok("transcribir rechaza base64 inválido", base64Malo.estado === 400, base64Malo.datos?.error);
const audioVacio = await json("/api/voz/transcribir", { tipo: "audio/webm", base64: "" });
ok("transcribir rechaza audio vacío", audioVacio.estado === 400, audioVacio.datos?.error);
const pesado = await json("/api/voz/transcribir", { tipo: "audio/webm", base64: "A".repeat(1_000_004) });
ok("transcribir rechaza audio demasiado pesado", pesado.estado === 413, pesado.datos?.error);
const cuerpoRoto = await json("/api/voz/transcribir", "no soy un objeto");
ok("transcribir rechaza un cuerpo que no es un audio", cuerpoRoto.estado === 400, cuerpoRoto.datos?.error);

// --- Frases que se leen en voz alta: se arman en el navegador, acá se prueban sueltas ---
// Node 24 puede importar el archivo .ts directamente; con un Node más viejo esta parte se saltea.
let frases = null;
try {
  frases = await import(new URL("../src/lib/frases.ts", import.meta.url).href);
} catch {
  console.log("AVISO este Node no puede leer archivos .ts: no se probaron las frases.");
}
if (frases) {
  const presupuestos = frases.frasePresupuestos([
    { precio: 85000, cuando: "Hoy", mensaje: "Voy con repuestos", prestador: { nombre: "Ramón Flores", aniosExperiencia: 12 } },
    { precio: 1250000, cuando: "A coordinar", mensaje: "Incluye materiales. ".repeat(60), prestador: { nombre: "Marta Cruz", aniosExperiencia: 0 } },
  ]);
  ok("presupuestos en una frase natural", presupuestos.startsWith("Tenés 2 presupuestos. Ramón, 12 años de experiencia, te pasó 85.000 pesos y puede ir hoy."), `"${presupuestos.slice(0, 120)}…"`);
  ok("los millones se dicen en palabras", presupuestos.includes("Marta te pasó 1 millón 250.000 pesos y el día es a coordinar."));
  const revisar = frases.frasePedidoPorRevisar({ titulo: "Reparar termotanque que pierde agua", rubro: "Plomería", esOtroRubro: false, zona: "Alto Comedero", urgencia: "hoy", precioMin: 60000, precioMax: 120000 });
  ok(
    "el resumen del pedido termina invitando a seguir",
    revisar === "Entendí que necesitás esto: reparar termotanque que pierde agua. Es un trabajo de plomería en Alto Comedero, para hoy. Suele costar entre 60.000 y 120.000 pesos de mano de obra. Si está bien, tocá seguir. Si no, corregilo en pantalla.",
    `"${revisar}"`,
  );
  const paraPrestador = frases.frasePedidoParaPresupuestar({ titulo: "Reparar termotanque", descripcion: "Pierde agua por abajo.", rubro: "Plomería", esOtroRubro: false, zona: "Alto Comedero", urgencia: "hoy", ejemplo: false, precioMin: null, precioMax: null });
  ok("el pedido para el prestador", paraPrestador === "Pedido de plomería en Alto Comedero, para hoy: reparar termotanque. Pierde agua por abajo.", `"${paraPrestador}"`);
  const largo = frases.frasePedidoParaPresupuestar({ titulo: "Pintar la casa", descripcion: "Son tres ambientes y un pasillo. ".repeat(40), rubro: "Pintura", esOtroRubro: false, zona: "Centro", urgencia: "semana", ejemplo: true, precioMin: 900000, precioMax: 1500000 });
  ok("un detalle muy largo se acorta sin perder el precio", largo.endsWith("Suele costar entre 900.000 y 1 millón 500.000 pesos de mano de obra."));
  const todas = [presupuestos, revisar, paraPrestador, largo];
  ok("ninguna frase pasa el tope ni lleva signo de pesos", todas.every((f) => f.length <= 600 && !f.includes("$")), `(${todas.map((f) => f.length).join(", ")} caracteres)`);
}

// --- Ida y vuelta con ElevenLabs: leer un texto y transcribir ese mismo audio ---
if (!estado.datos?.voz) {
  const sinClave = await json("/api/voz/decir", { texto: "Hola, vecino." });
  ok("sin clave, decir avisa con un error claro", sinClave.estado === 503 && Boolean(sinClave.datos?.error), sinClave.datos?.error);
  console.log("AVISO este servidor no tiene ELEVENLABS_API_KEY: no se probó la voz real.");
} else {
  const original = "Tenés 2 presupuestos. Ramón, 12 años de experiencia, te pasó 85.000 pesos y puede ir hoy a Alto Comedero.";
  let t0 = Date.now();
  const habla = await pedir("/api/voz/decir", { texto: original });
  const mp3 = Buffer.from(await habla.arrayBuffer());
  // Un MP3 empieza con la etiqueta ID3 o con la marca de sincronismo 0xFF 0xEx.
  const esMp3 = mp3.subarray(0, 3).toString("latin1") === "ID3" || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0);
  ok("decir devuelve audio/mpeg no vacío", habla.status === 200 && habla.headers.get("content-type") === "audio/mpeg" && mp3.length > 2000 && esMp3, `(${mp3.length} bytes, ${Date.now() - t0} ms)`);

  if (habla.status === 200) {
    t0 = Date.now();
    const vuelta = await json("/api/voz/transcribir", { tipo: "audio/mpeg", base64: mp3.toString("base64") });
    const texto = vuelta.datos?.texto ?? "";
    ok("transcribir devuelve texto", vuelta.estado === 200 && texto.length > 20, `(${Date.now() - t0} ms) "${texto}"`);
    const coincide = parecido(original.replace("85.000", "85").replace("2 presupuestos", "presupuestos"), texto);
    ok("la transcripción se parece al texto original", coincide >= 0.8, `(${Math.round(coincide * 100)} % de las palabras)`);
    ok("el monto se leyó como miles", /85[ .]?000|85 mil|ochenta y cinco mil/i.test(texto), `"${texto.match(/[^.]*pesos/i)?.[0]?.trim() ?? ""}"`);
  }
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} ${fallas === 1 ? "falla" : "fallas"}.`);
process.exit(fallas === 0 ? 0 : 1);
