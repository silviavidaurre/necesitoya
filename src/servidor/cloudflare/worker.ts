import { configurarEntorno } from "@/lib/config";
import { usarAlmacen } from "@/lib/db";
import { configurarSegundoPlano } from "@/lib/segundo-plano";
import { almacenD1, type BaseD1 } from "@/servidor/cloudflare/almacen-d1";
import { atender } from "@/servidor/rutas";

// Entrada de NecesitoYa en Cloudflare Workers: la API usa la base D1 y el resto son archivos estáticos.

interface Entorno {
  DB: BaseD1;
  ASSETS: { fetch(peticion: Request): Promise<Response> };
  [clave: string]: unknown;
}

interface Contexto {
  waitUntil(tarea: Promise<unknown>): void;
}

export default {
  async fetch(peticion: Request, entorno: Entorno, contexto: Contexto): Promise<Response> {
    const camino = new URL(peticion.url).pathname;
    if (!camino.startsWith("/api/")) return entorno.ASSETS.fetch(peticion);

    usarAlmacen(almacenD1(entorno.DB));
    configurarEntorno(entorno);
    configurarSegundoPlano((tarea) => contexto.waitUntil(tarea));
    try {
      return await atender(peticion);
    } catch (error) {
      console.error("[api]", error);
      return Response.json({ error: "Error interno del servidor." }, { status: 500 });
    }
  },
};
