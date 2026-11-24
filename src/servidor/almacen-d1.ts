import { baseInicial, type Almacen } from "@/lib/db";
import type { BaseDeDatos } from "@/lib/tipos";

// Almacén para producción en Cloudflare: una base D1 (SQLite).
// Todo el estado vive en una sola fila JSON con número de versión. Cada escritura
// solo se aplica si nadie escribió antes (control optimista) y, si hubo choque, reintenta.
// Alcanza para el volumen del MVP; cuando crezca, se pasa a tablas por entidad sin tocar la API.

interface SentenciaD1 {
  bind(...valores: unknown[]): SentenciaD1;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface BaseD1 {
  prepare(sql: string): SentenciaD1;
}

interface Fila {
  version: number;
  datos: string;
}

const INTENTOS = 6;
let sembrada = false;

// Crea la tabla y la fila inicial si no existen. Es seguro llamarla más de una vez.
async function sembrar(d1: BaseD1) {
  await d1
    .prepare("CREATE TABLE IF NOT EXISTS estado (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, datos TEXT NOT NULL)")
    .run();
  await d1
    .prepare("INSERT OR IGNORE INTO estado (id, version, datos) VALUES (1, 1, ?)")
    .bind(JSON.stringify(baseInicial()))
    .run();
  await d1
    .prepare("CREATE TABLE IF NOT EXISTS fotos (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, datos TEXT NOT NULL, creado TEXT NOT NULL)")
    .run();
  await d1
    .prepare("CREATE TABLE IF NOT EXISTS uso (dia TEXT NOT NULL, nombre TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, nombre))")
    .run();
  sembrada = true;
}

// La fila única de D1 admite hasta 2 MB. Se corta bastante antes: si se llenara, ninguna escritura
// volvería a funcionar y la app quedaría trabada para todos.
const TOPE_DEL_ESTADO = 1_400_000;

function seleccionar(d1: BaseD1) {
  return d1.prepare("SELECT version, datos FROM estado WHERE id = 1").first<Fila>();
}

async function leerFila(d1: BaseD1): Promise<Fila> {
  if (!sembrada) await sembrar(d1);
  let fila = await seleccionar(d1);
  if (!fila) {
    // Alguien vació la tabla con el Worker ya en marcha: se vuelve a sembrar.
    await sembrar(d1);
    fila = await seleccionar(d1);
  }
  if (!fila) throw new Error("La base de datos no tiene la fila de estado.");
  return fila;
}

export function almacenD1(d1: BaseD1): Almacen {
  return {
    async guardarFoto(id, foto) {
      if (!sembrada) await sembrar(d1);
      await d1
        .prepare("INSERT OR REPLACE INTO fotos (id, tipo, datos, creado) VALUES (?, ?, ?, ?)")
        .bind(id, foto.tipo, foto.base64, new Date().toISOString())
        .run();
    },
    async leerFoto(id) {
      if (!sembrada) await sembrar(d1);
      const fila = await d1.prepare("SELECT tipo, datos FROM fotos WHERE id = ?").bind(id).first<{ tipo: string; datos: string }>();
      return fila ? { tipo: fila.tipo, base64: fila.datos } : null;
    },
    async leer() {
      return JSON.parse((await leerFila(d1)).datos) as BaseDeDatos;
    },
    async modificar(cambio) {
      for (let intento = 0; intento < INTENTOS; intento++) {
        const fila = await leerFila(d1);
        const db = JSON.parse(fila.datos) as BaseDeDatos;
        const resultado = cambio(db);
        const nuevo = JSON.stringify(db);
        // Se permite achicar o mantener el tamaño aunque ya esté al límite (para poder limpiar).
        if (nuevo.length > TOPE_DEL_ESTADO && nuevo.length > fila.datos.length) {
          throw new Error("La base llegó a su tope de tamaño: hay que limpiar datos viejos.");
        }
        const escritura = await d1
          .prepare("UPDATE estado SET datos = ?, version = version + 1 WHERE id = 1 AND version = ?")
          .bind(nuevo, fila.version)
          .run();
        if (escritura.meta.changes === 1) return resultado;
        // Otro pedido escribió primero: se espera un instante y se vuelve a intentar sobre el estado nuevo.
        await new Promise((listo) => setTimeout(listo, 15 * (intento + 1)));
      }
      throw new Error("No se pudo guardar: demasiadas escrituras al mismo tiempo.");
    },
    async consumirCupo(nombre) {
      if (!sembrada) await sembrar(d1);
      const fila = await d1
        .prepare("INSERT INTO uso (dia, nombre, n) VALUES (?, ?, 1) ON CONFLICT (dia, nombre) DO UPDATE SET n = n + 1 RETURNING n")
        .bind(new Date().toISOString().slice(0, 10), nombre)
        .first<{ n: number }>();
      return fila?.n ?? 1;
    },
  };
}
