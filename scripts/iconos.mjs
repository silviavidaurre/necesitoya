// Genera los íconos PNG de la app instalable a partir del logo (public/icono.svg), sin dependencias.
// Dibuja las mismas formas del SVG (globo azul, "N" blanca, punto amarillo) con suavizado de bordes.
// Uso: node scripts/iconos.mjs
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";

const AZUL = [11, 111, 214];
const BLANCO = [255, 255, 255];
const SOL = [255, 201, 60];

function dentroDelRectRedondeado(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function dentroDelTriangulo(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by);
  const d2 = s(px, py, bx, by, cx, cy);
  const d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function distanciaAlSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Color del logo en un punto del lienzo de 48x48 del SVG. null = transparente.
function colorDelLogo(x, y) {
  if ((x - 36.5) ** 2 + (y - 29) ** 2 <= 9) return SOL;
  const trazos = [
    [15, 30, 15, 14],
    [15, 14, 29, 30],
    [29, 30, 29, 14],
  ];
  if (trazos.some(([ax, ay, bx, by]) => distanciaAlSegmento(x, y, ax, ay, bx, by) <= 2.1)) return BLANCO;
  if (dentroDelRectRedondeado(x, y, 2, 4, 46, 40, 10) || dentroDelTriangulo(x, y, [13, 39], [22, 40], [13, 47])) return AZUL;
  return null;
}

// `escala` = qué parte del ícono ocupa el logo; `fondo` = color de fondo (para el ícono "maskable").
function dibujar(lado, { escala = 1, fondo = null } = {}) {
  const muestras = 4;
  const datos = Buffer.alloc(lado * (lado * 4 + 1));
  const margen = (lado - lado * escala) / 2;
  for (let fy = 0; fy < lado; fy++) {
    datos[fy * (lado * 4 + 1)] = 0;
    for (let fx = 0; fx < lado; fx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < muestras; sy++) {
        for (let sx = 0; sx < muestras; sx++) {
          const x = ((fx + (sx + 0.5) / muestras - margen) / (lado * escala)) * 48;
          const y = ((fy + (sy + 0.5) / muestras - margen) / (lado * escala)) * 48;
          const color = colorDelLogo(x, y) ?? fondo;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const total = muestras * muestras;
      const i = fy * (lado * 4 + 1) + 1 + fx * 4;
      datos[i] = a ? Math.round(r / a) : 0;
      datos[i + 1] = a ? Math.round(g / a) : 0;
      datos[i + 2] = a ? Math.round(b / a) : 0;
      datos[i + 3] = Math.round((a / total) * 255);
    }
  }
  return png(lado, datos);
}

function png(lado, crudo) {
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
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const control = Buffer.alloc(4);
    control.writeUInt32BE(crc(td));
    return Buffer.concat([largo, td, control]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8;
  cabecera[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", cabecera), trozo("IDAT", zlib.deflateSync(crudo, { level: 9 })), trozo("IEND", Buffer.alloc(0))]);
}

const BLANCO_FONDO = [255, 255, 255];
writeFileSync("public/icono-192.png", dibujar(192, { escala: 0.9 }));
writeFileSync("public/icono-512.png", dibujar(512, { escala: 0.9 }));
// Maskable: el celular lo recorta en círculo o en gota, así que el logo va chico y sobre fondo blanco lleno.
writeFileSync("public/icono-maskable-512.png", dibujar(512, { escala: 0.62, fondo: BLANCO_FONDO }));
// Ícono del iPhone: sin transparencia.
writeFileSync("public/apple-touch-icon.png", dibujar(180, { escala: 0.78, fondo: BLANCO_FONDO }));
console.log("Íconos listos en public/.");
