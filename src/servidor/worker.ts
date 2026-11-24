import { configurarGoogle, configurarIa, configurarVoz } from "@/lib/config";
import { usarAlmacen } from "@/lib/db";
import { almacenD1, type BaseD1 } from "./almacen-d1";
import { atender } from "./rutas";

// Entrada de NecesitoYa en Cloudflare Workers: la API usa la base D1 y el resto son archivos estáticos.

interface Entorno {
  DB: BaseD1;
  ASSETS: { fetch(peticion: Request): Promise<Response> };
  ANTHROPIC_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
}

export default {
  async fetch(peticion: Request, entorno: Entorno): Promise<Response> {
    const camino = new URL(peticion.url).pathname;
    if (!camino.startsWith("/api/")) return entorno.ASSETS.fetch(peticion);

    usarAlmacen(almacenD1(entorno.DB));
    configurarIa(entorno.ANTHROPIC_API_KEY);
    configurarVoz(entorno.ELEVENLABS_API_KEY);
    configurarGoogle(entorno.GOOGLE_CLIENT_ID);
    try {
      return await atender(peticion);
    } catch (error) {
      console.error("[api]", error);
      return Response.json({ error: "Error interno del servidor." }, { status: 500 });
    }
  },
};
