import { promises as fs } from "node:fs";
import path from "node:path";
import { baseInicial, type Almacen } from "@/lib/db";
import type { BaseDeDatos } from "@/lib/tipos";

// Almacén para desarrollo en la PC: un archivo JSON en data/db.json.
const ARCHIVO = path.join(process.cwd(), "data", "db.json");

let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => undefined);
  return resultado;
}

async function escribir(db: BaseDeDatos) {
  await fs.mkdir(path.dirname(ARCHIVO), { recursive: true });
  const contenido = JSON.stringify(db, null, 2);
  const temporal = ARCHIVO + ".tmp";
  await fs.writeFile(temporal, contenido, "utf8");
  // En Windows el reemplazo falla (EPERM/EBUSY) si otro programa tiene el archivo abierto un instante
  // (antivirus, el vigilante de archivos de Vite). Se reintenta y, si sigue trabado, se escribe directo.
  for (let intento = 0; intento < 5; intento++) {
    try {
      await fs.rename(temporal, ARCHIVO);
      return;
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException).code;
      if (codigo !== "EPERM" && codigo !== "EBUSY" && codigo !== "EACCES") throw e;
      await new Promise((listo) => setTimeout(listo, 40 * (intento + 1)));
    }
  }
  await fs.writeFile(ARCHIVO, contenido, "utf8");
  await fs.rm(temporal, { force: true });
}

async function leerArchivo(): Promise<BaseDeDatos> {
  try {
    return JSON.parse(await fs.readFile(ARCHIVO, "utf8")) as BaseDeDatos;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const inicial = baseInicial();
    await escribir(inicial);
    return inicial;
  }
}

const CARPETA_FOTOS = path.join(process.cwd(), "data", "fotos");

function archivoDeFoto(id: string) {
  // El id es un UUID generado por el servidor; se limpia igual por si llega otra cosa.
  return path.join(CARPETA_FOTOS, `${id.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
}

// En desarrollo los cupos se cuentan en memoria: se reinician al reiniciar el servidor.
const cupos = new Map<string, number>();

export const almacenArchivo: Almacen = {
  async consumirCupo(nombre) {
    const clave = `${new Date().toISOString().slice(0, 10)}:${nombre}`;
    const cuenta = (cupos.get(clave) ?? 0) + 1;
    cupos.set(clave, cuenta);
    return cuenta;
  },
  async guardarFoto(id, foto) {
    await fs.mkdir(CARPETA_FOTOS, { recursive: true });
    await fs.writeFile(archivoDeFoto(id), JSON.stringify(foto), "utf8");
  },
  async borrarFotos(ids) {
    await Promise.all(ids.map((id) => fs.rm(archivoDeFoto(id), { force: true })));
  },
  async leerFoto(id) {
    try {
      return JSON.parse(await fs.readFile(archivoDeFoto(id), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },
  leer: () => enCola(leerArchivo),
  modificar: (cambio) =>
    enCola(async () => {
      const db = await leerArchivo();
      const resultado = cambio(db);
      await escribir(db);
      return resultado;
    }),
};
