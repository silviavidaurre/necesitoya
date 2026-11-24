// Ayudas compartidas por las tandas de pruebas.
// Las cuentas de prueba usan mails que terminan en .test: lo que crean no cuenta en las métricas
// y se puede borrar después sin tocar datos reales.
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

// Crea una cuenta nueva con mail y contraseña inventados (no se imprimen) y devuelve su llave.
export async function cuentaDePrueba(base, nombre = "prueba") {
  const marca = crypto.randomUUID().slice(0, 12);
  for (let intento = 0; ; intento += 1) {
    try {
      const respuesta = await fetch(`${base}/api/cuenta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${nombre}-${marca}@necesitoya.test`, contrasena: crypto.randomUUID() }),
      });
      const datos = await respuesta.json();
      if (!datos?.clave) throw new Error(`No se pudo crear la cuenta de prueba (${respuesta.status}).`);
      return datos.clave;
    } catch (error) {
      if (intento >= 2) throw error;
    }
  }
}

// Lee un valor del entorno o de .env.local, sin imprimirlo nunca.
export function secretoLocal(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  try {
    const linea = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${nombre}=`));
    return linea ? linea.slice(nombre.length + 1).trim() : "";
  } catch {
    return "";
  }
}

// PNG de 64x64 de un solo color, para probar la subida de fotos.
export function png(gris = 120) {
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
  const crudo = Buffer.concat(Array.from({ length: 64 }, () => fila));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(crudo, { level: 0 })), trozo("IEND", Buffer.alloc(0))]).toString("base64");
}

// Dirección de prueba (privada: no tiene que aparecer en ninguna respuesta para otros) y el turno que corresponde
// a un presupuesto mandado con "Hoy" o "Mañana" (la API los traduce a días y franjas).
export const DIRECCION = { calle: "Calle de Prueba 4321", referencia: "Portón verde de prueba" };

export function hoyEnJujuy(dias = 0) {
  const fecha = new Date(Date.now() - 3 * 3600_000);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function turnoPara(cuando = "Hoy") {
  return cuando === "Mañana" ? { dia: hoyEnJujuy(1), franja: "manana" } : { dia: hoyEnJujuy(0), franja: "tarde" };
}
