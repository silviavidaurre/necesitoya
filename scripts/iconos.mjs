// Genera todos los íconos a partir del logo (public/icono.svg), sin dependencias:
// - los de la app web instalable (public/),
// - los de partida de Capacitor (assets/),
// - los de Android: clásicos, redondos, adaptativos (frente y fondo) y la pantalla de arranque.
// Dibuja las mismas formas del SVG (globo negro, "N" blanca, punto naranja) con suavizado de bordes.
// Uso: node scripts/iconos.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

const NEGRO = [13, 13, 13];
const BLANCO = [255, 255, 255];
const NARANJA = [255, 90, 31];

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
// `invertido`: globo blanco y "N" negra, para ponerlo sobre fondo negro.
function colorDelLogo(x, y, invertido) {
  if ((x - 36.5) ** 2 + (y - 29) ** 2 <= 9) return NARANJA;
  const trazos = [
    [15, 30, 15, 14],
    [15, 14, 29, 30],
    [29, 30, 29, 14],
  ];
  if (trazos.some(([ax, ay, bx, by]) => distanciaAlSegmento(x, y, ax, ay, bx, by) <= 2.1)) return invertido ? NEGRO : BLANCO;
  if (dentroDelRectRedondeado(x, y, 2, 4, 46, 40, 10) || dentroDelTriangulo(x, y, [13, 39], [22, 40], [13, 47])) return invertido ? BLANCO : NEGRO;
  return null;
}

// Dibuja el logo centrado en un lienzo de ancho x alto.
// `escala`: qué parte del lado menor ocupa el logo · `fondo`: color de fondo (null = transparente)
// `redondo`: recorta en círculo (ícono redondo de Android) · `invertido`: logo claro para fondo oscuro.
function dibujar(ancho, alto, { escala = 1, fondo = null, redondo = false, invertido = false } = {}) {
  const muestras = 4;
  const fila = ancho * 4 + 1;
  const datos = Buffer.alloc(alto * fila);
  const lado = Math.min(ancho, alto) * escala;
  const mx = (ancho - lado) / 2;
  const my = (alto - lado) / 2;
  const radio = Math.min(ancho, alto) / 2;
  for (let fy = 0; fy < alto; fy++) {
    datos[fy * fila] = 0;
    for (let fx = 0; fx < ancho; fx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < muestras; sy++) {
        for (let sx = 0; sx < muestras; sx++) {
          const px = fx + (sx + 0.5) / muestras;
          const py = fy + (sy + 0.5) / muestras;
          if (redondo && (px - ancho / 2) ** 2 + (py - alto / 2) ** 2 > radio * radio) continue;
          const color = colorDelLogo(((px - mx) / lado) * 48, ((py - my) / lado) * 48, invertido) ?? fondo;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const i = fy * fila + 1 + fx * 4;
      datos[i] = a ? Math.round(r / a) : 0;
      datos[i + 1] = a ? Math.round(g / a) : 0;
      datos[i + 2] = a ? Math.round(b / a) : 0;
      datos[i + 3] = Math.round((a / (muestras * muestras)) * 255);
    }
  }
  return png(ancho, alto, datos);
}

function png(ancho, alto, crudo) {
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
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8;
  cabecera[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", cabecera), trozo("IDAT", zlib.deflateSync(crudo, { level: 9 })), trozo("IEND", Buffer.alloc(0))]);
}

function guardar(ruta, contenido) {
  mkdirSync(ruta.slice(0, ruta.lastIndexOf("/")), { recursive: true });
  writeFileSync(ruta, contenido);
}

// --- App web instalable ---------------------------------------------------------------------------
guardar("public/icono-192.png", dibujar(192, 192, { escala: 0.9 }));
guardar("public/icono-512.png", dibujar(512, 512, { escala: 0.9 }));
// Maskable: el celular lo recorta en círculo o en gota, así que el logo va chico y sobre fondo blanco lleno.
guardar("public/icono-maskable-512.png", dibujar(512, 512, { escala: 0.62, fondo: BLANCO }));
// Ícono del iPhone: sin transparencia.
guardar("public/apple-touch-icon.png", dibujar(180, 180, { escala: 0.78, fondo: BLANCO }));

// --- Puntos de partida de Capacitor ----------------------------------------------------------------
guardar("assets/icon-only.png", dibujar(1024, 1024, { escala: 0.78, fondo: BLANCO }));
guardar("assets/icon-foreground.png", dibujar(1024, 1024, { escala: 0.62 }));
writeFileSync("assets/icon-background.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#ffffff"/></svg>\n');

// --- Android ---------------------------------------------------------------------------------------
const RES = "android/app/src/main/res";
const DENSIDADES = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [densidad, lado] of Object.entries(DENSIDADES)) {
  guardar(`${RES}/mipmap-${densidad}/ic_launcher.png`, dibujar(lado, lado, { escala: 0.8, fondo: BLANCO }));
  guardar(`${RES}/mipmap-${densidad}/ic_launcher_round.png`, dibujar(lado, lado, { escala: 0.62, fondo: BLANCO, redondo: true }));
  // Adaptativo: el sistema lo achica (inset de 16,7 %) y lo recorta; el logo va con aire para no cortarse.
  guardar(`${RES}/mipmap-${densidad}/ic_launcher_foreground.png`, dibujar(lado, lado, { escala: 0.74 }));
  guardar(`${RES}/mipmap-${densidad}/ic_launcher_background.png`, dibujar(lado, lado, { escala: 0, fondo: BLANCO }));
}
// Pantalla de arranque: fondo negro con el logo claro, en todas las medidas que trae el proyecto.
const ARRANQUE = {
  drawable: [480, 320],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
};
for (const [carpeta, [ancho, alto]] of Object.entries(ARRANQUE)) {
  guardar(`${RES}/${carpeta}/splash.png`, dibujar(ancho, alto, { escala: 0.28, fondo: NEGRO, invertido: true }));
}
writeFileSync(`${RES}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n');

console.log("Íconos listos: public/, assets/ y android/.");
