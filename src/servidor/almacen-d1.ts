import { baseInicial, type Almacen } from "@/lib/db";
import type { BaseDeDatos } from "@/lib/tipos";

// Almacén para producción en Cloudflare: una base D1 (SQLite) con una tabla por colección.
//
// Antes todo el estado vivía en UNA fila JSON (tabla `estado`), con un tope de unos 1,4 MB. Ahora cada pedido,
// prestador, mensaje, etc. es una fila de su tabla (t_pedidos, t_prestadores...), así que no hay tope práctico.
// La API no cambia: se sigue leyendo la base entera y se guarda solo lo que cambió.
//
// Se cuida la cantidad de consultas por pedido (D1 las limita): la lectura es UNA consulta (todas las tablas
// juntas) y las escrituras van agrupadas, varias filas por sentencia.
//
// Escrituras: control optimista con una fila de versión. Cada guardado sube la versión y deja una ficha propia;
// las filas solo se escriben si la ficha es la nuestra (todo en un mismo lote, que D1 corre como transacción).
// Si otro guardó antes, se vuelve a leer y se reintenta.
//
// Migración: la primera vez, se copian las filas desde la fila `estado`, que queda intacta como respaldo.

interface Resultado<T> {
  results?: T[];
  meta: { changes: number };
}

interface SentenciaD1 {
  bind(...valores: unknown[]): SentenciaD1;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
  all<T>(): Promise<Resultado<T>>;
}

export interface BaseD1 {
  prepare(sql: string): SentenciaD1;
  batch<T = unknown>(sentencias: SentenciaD1[]): Promise<Resultado<T>[]>;
}

// Cada colección de la base, con el campo que sirve de clave de la fila.
const COLECCIONES = {
  prestadores: "id",
  pedidos: "id",
  ofertas: "id",
  cuentas: "sub",
  mensajes: "id",
  pagos: "id",
  suscripciones: "endpoint",
  avisos: "id",
  verificaciones: "id",
  reclamos: "id",
  denuncias: "id",
  bajas: "id",
} as const satisfies Record<keyof BaseDeDatos, string>;

type Coleccion = keyof typeof COLECCIONES;
const NOMBRES = Object.keys(COLECCIONES) as Coleccion[];
const MIGRACION = "tablas-v1";
// Cuando se suma una colección nueva (una tabla nueva), se sube esta marca: crea las tablas que falten sin migrar nada.
const ESQUEMA = "esquema-2";
const INTENTOS = 6;
// D1 admite hasta 100 valores por sentencia y sentencias de hasta 100 KB: se agrupa por debajo de eso.
const FILAS_POR_SENTENCIA = 45;
const BYTES_POR_SENTENCIA = 80_000;

let lista = false;

function claveDe(coleccion: Coleccion, fila: unknown): string {
  return String((fila as Record<string, unknown>)[COLECCIONES[coleccion]] ?? "");
}

// Parte una lista de filas en grupos que entran en una sentencia.
function agrupar<T extends { datos?: string }>(filas: T[]): T[][] {
  const grupos: T[][] = [];
  let actual: T[] = [];
  let bytes = 0;
  for (const fila of filas) {
    const peso = (fila.datos?.length ?? 0) + 100;
    if (actual.length > 0 && (actual.length >= FILAS_POR_SENTENCIA || bytes + peso > BYTES_POR_SENTENCIA)) {
      grupos.push(actual);
      actual = [];
      bytes = 0;
    }
    actual.push(fila);
    bytes += peso;
  }
  if (actual.length > 0) grupos.push(actual);
  return grupos;
}

async function crearTablas(d1: BaseD1) {
  await d1.batch([
    ...NOMBRES.map((n) => d1.prepare(`CREATE TABLE IF NOT EXISTS t_${n} (id TEXT PRIMARY KEY, datos TEXT NOT NULL)`)),
    d1.prepare("CREATE TABLE IF NOT EXISTS version (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL, ficha TEXT NOT NULL)"),
    d1.prepare("INSERT OR IGNORE INTO version (id, v, ficha) VALUES (1, 1, '')"),
    d1.prepare("CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, estado TEXT NOT NULL, fecha TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS fotos (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, datos TEXT NOT NULL, creado TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS uso (dia TEXT NOT NULL, nombre TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, nombre))"),
  ]);
}

// Escribe todas las filas de una base en las tablas, varias por sentencia y en lotes chicos.
async function volcar(d1: BaseD1, db: Partial<BaseDeDatos>) {
  const sentencias: SentenciaD1[] = [];
  for (const nombre of NOMBRES) {
    const filas = ((db[nombre] as unknown[] | undefined) ?? []).map((f) => ({ id: claveDe(nombre, f), datos: JSON.stringify(f) })).filter((f) => f.id);
    for (const grupo of agrupar(filas)) {
      sentencias.push(
        d1.prepare(`INSERT OR REPLACE INTO t_${nombre} (id, datos) VALUES ${grupo.map(() => "(?, ?)").join(", ")}`).bind(...grupo.flatMap((f) => [f.id, f.datos])),
      );
    }
  }
  for (let i = 0; i < sentencias.length; i += 10) await d1.batch(sentencias.slice(i, i + 10));
}

// Pasa los datos de la fila única `estado` a las tablas, una sola vez. Un Worker toma la tarea; los demás esperan.
async function migrar(d1: BaseD1) {
  const tomada = await d1
    .prepare("INSERT OR IGNORE INTO migraciones (nombre, estado, fecha) VALUES (?, 'en curso', ?)")
    .bind(MIGRACION, new Date().toISOString())
    .run();
  if (tomada.meta.changes !== 1) {
    // Otro Worker está migrando: se espera hasta 20 segundos.
    for (let i = 0; i < 40; i++) {
      await new Promise((listo) => setTimeout(listo, 500));
      const estado = await d1.prepare("SELECT estado FROM migraciones WHERE nombre = ?").bind(MIGRACION).first<{ estado: string }>();
      if (estado?.estado === "hecha") return;
    }
    throw new Error("La migración de la base está tardando. Probá de nuevo en un momento.");
  }
  try {
    const existe = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'estado'").first<{ name: string }>();
    const fila = existe ? await d1.prepare("SELECT datos FROM estado WHERE id = 1").first<{ datos: string }>() : null;
    // Base nueva (sin fila vieja): arranca con los datos de muestra, como antes.
    await volcar(d1, fila ? (JSON.parse(fila.datos) as BaseDeDatos) : baseInicial());
    await d1.prepare("UPDATE migraciones SET estado = 'hecha', fecha = ? WHERE nombre = ?").bind(new Date().toISOString(), MIGRACION).run();
  } catch (error) {
    // Si falla a mitad, se libera para reintentar (volcar es idempotente: reemplaza filas por las mismas).
    await d1.prepare("DELETE FROM migraciones WHERE nombre = ? AND estado = 'en curso'").bind(MIGRACION).run();
    throw error;
  }
}

async function preparar(d1: BaseD1) {
  if (lista) return;
  // Lo normal (ya migrada y con el esquema al día) es una sola consulta; si falla es porque la tabla todavía no existe.
  const marcas = await d1
    .prepare("SELECT nombre, estado FROM migraciones WHERE nombre IN (?, ?)")
    .bind(MIGRACION, ESQUEMA)
    .all<{ nombre: string; estado: string }>()
    .then((r) => r.results ?? [])
    .catch(() => []);
  const migrada = marcas.some((m) => m.nombre === MIGRACION && m.estado === "hecha");
  const alDia = marcas.some((m) => m.nombre === ESQUEMA);
  if (!migrada) {
    await crearTablas(d1);
    await migrar(d1);
  }
  if (!alDia) {
    // Solo crea las tablas que falten (CREATE IF NOT EXISTS): no toca datos.
    await crearTablas(d1);
    await d1.prepare("INSERT OR IGNORE INTO migraciones (nombre, estado, fecha) VALUES (?, 'hecha', ?)").bind(ESQUEMA, new Date().toISOString()).run();
  }
  lista = true;
}

interface Lectura {
  db: BaseDeDatos;
  version: number;
  // Cómo estaba guardada cada fila (texto JSON), para saber después qué cambió.
  originales: Record<Coleccion, Map<string, string>>;
}

// Toda la base: la versión y las filas de todas las tablas, unidas de a pocas por consulta (D1 limita las uniones)
// y todas en un mismo lote, que se lee como una sola foto de la base.
const PARTES_DE_LA_CONSULTA = [
  "SELECT 'version' AS c, '' AS id, CAST(v AS TEXT) AS datos, 0 AS orden FROM version WHERE id = 1",
  ...NOMBRES.map((n) => `SELECT '${n}' AS c, id, datos, rowid AS orden FROM t_${n}`),
];
const CONSULTAS_DE_TODO = Array.from({ length: Math.ceil(PARTES_DE_LA_CONSULTA.length / 4) }, (_, i) => PARTES_DE_LA_CONSULTA.slice(i * 4, i * 4 + 4).join(" UNION ALL "));

async function leerTodo(d1: BaseD1): Promise<Lectura> {
  await preparar(d1);
  const lotes = await d1.batch<{ c: string; id: string; datos: string; orden: number }>(CONSULTAS_DE_TODO.map((sql) => d1.prepare(sql)));
  const filas = lotes.flatMap((lote) => lote.results ?? []);
  const db = {} as Record<Coleccion, Record<string, unknown>[]>;
  const originales = {} as Record<Coleccion, Map<string, string>>;
  for (const nombre of NOMBRES) {
    db[nombre] = [];
    originales[nombre] = new Map();
  }
  let version = 1;
  for (const fila of filas.sort((a, b) => a.orden - b.orden)) {
    if (fila.c === "version") {
      version = Number(fila.datos);
      continue;
    }
    const nombre = fila.c as Coleccion;
    originales[nombre].set(fila.id, fila.datos);
    db[nombre].push(JSON.parse(fila.datos));
  }
  // Mismo orden de siempre (por fecha de creación cuando la hay), para que la app vea lo mismo que antes.
  for (const nombre of NOMBRES) db[nombre].sort((a, b) => String(a.creado ?? "").localeCompare(String(b.creado ?? "")));
  return { db: db as unknown as BaseDeDatos, version, originales };
}

export function almacenD1(d1: BaseD1): Almacen {
  return {
    async guardarFoto(id, foto) {
      await preparar(d1);
      await d1.prepare("INSERT OR REPLACE INTO fotos (id, tipo, datos, creado) VALUES (?, ?, ?, ?)").bind(id, foto.tipo, foto.base64, new Date().toISOString()).run();
    },
    async leerFoto(id) {
      await preparar(d1);
      const fila = await d1.prepare("SELECT tipo, datos FROM fotos WHERE id = ?").bind(id).first<{ tipo: string; datos: string }>();
      return fila ? { tipo: fila.tipo, base64: fila.datos } : null;
    },
    async borrarFotos(ids) {
      await preparar(d1);
      for (let i = 0; i < ids.length; i += 90) {
        const tanda = ids.slice(i, i + 90);
        await d1.prepare(`DELETE FROM fotos WHERE id IN (${tanda.map(() => "?").join(",")})`).bind(...tanda).run();
      }
    },
    async leer() {
      return (await leerTodo(d1)).db;
    },
    async modificar(cambio) {
      for (let intento = 0; intento < INTENTOS; intento++) {
        const { db, version, originales } = await leerTodo(d1);
        const resultado = cambio(db);

        // Qué filas cambiaron o son nuevas, y cuáles se borraron, por tabla.
        const sentencias: SentenciaD1[] = [];
        const ficha = crypto.randomUUID();
        const esMia = "(SELECT ficha FROM version WHERE id = 1) = ?";
        for (const nombre of NOMBRES) {
          const antes = originales[nombre];
          const ahora = new Map<string, string>();
          for (const fila of (db[nombre] as unknown[] | undefined) ?? []) {
            const id = claveDe(nombre, fila);
            if (id) ahora.set(id, JSON.stringify(fila));
          }
          const escrituras = [...ahora].filter(([id, datos]) => antes.get(id) !== datos).map(([id, datos]) => ({ id, datos }));
          const borrados: { id: string; datos?: string }[] = [...antes.keys()].filter((id) => !ahora.has(id)).map((id) => ({ id }));
          for (const grupo of agrupar(escrituras)) {
            sentencias.push(
              d1
                .prepare(`INSERT OR REPLACE INTO t_${nombre} (id, datos) SELECT column1, column2 FROM (VALUES ${grupo.map(() => "(?, ?)").join(", ")}) WHERE ${esMia}`)
                .bind(...grupo.flatMap((f) => [f.id, f.datos]), ficha),
            );
          }
          for (const grupo of agrupar(borrados)) {
            sentencias.push(d1.prepare(`DELETE FROM t_${nombre} WHERE id IN (${grupo.map(() => "?").join(", ")}) AND ${esMia}`).bind(...grupo.map((b) => b.id), ficha));
          }
        }
        if (sentencias.length === 0) return resultado;

        const resultados = await d1.batch([d1.prepare("UPDATE version SET v = v + 1, ficha = ? WHERE id = 1 AND v = ?").bind(ficha, version), ...sentencias]);
        if (resultados[0].meta.changes === 1) return resultado;
        // Otro pedido escribió primero: se espera un instante y se vuelve a intentar sobre el estado nuevo.
        await new Promise((listo) => setTimeout(listo, 15 * (intento + 1) + Math.random() * 20));
      }
      throw new Error("No se pudo guardar: demasiadas escrituras al mismo tiempo.");
    },
    async consumirCupo(nombre) {
      await preparar(d1);
      const fila = await d1
        .prepare("INSERT INTO uso (dia, nombre, n) VALUES (?, ?, 1) ON CONFLICT (dia, nombre) DO UPDATE SET n = n + 1 RETURNING n")
        .bind(new Date().toISOString().slice(0, 10), nombre)
        .first<{ n: number }>();
      return fila?.n ?? 1;
    },
  };
}
