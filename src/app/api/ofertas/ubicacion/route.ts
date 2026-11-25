import { ubicacionValida } from "@/integraciones/mapbox-mapa/mapbox";
import { dentroDelCupo, dentroDelCupoDe, leer, modificar } from "@/lib/db";
import { trabajoActivo, trabajoDe } from "@/lib/trabajo";

// El celular del prestador elegido manda dónde está, solo mientras va en camino a la casa del vecino.
// El vecino lo ve moverse en el mapa del seguimiento. Al llegar (o si se cancela) la ubicación se borra.
const CADA_MS = 8_000;

class ErrorDeUbicacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const prestadorId = typeof cuerpo?.prestadorId === "string" ? cuerpo.prestadorId : "";
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  if (!prestadorId || !ofertaId) return Response.json({ error: "Faltan datos." }, { status: 400 });
  if (!ubicacionValida(cuerpo?.lat, cuerpo?.lng)) return Response.json({ error: "Esa ubicación no es válida." }, { status: 400 });
  const lat = Math.round(cuerpo.lat * 1e5) / 1e5;
  const lng = Math.round(cuerpo.lng * 1e5) / 1e5;
  const precision = Number.isFinite(cuerpo?.precision) ? Math.max(0, Math.min(5000, Math.round(cuerpo.precision))) : 0;

  const cuenta = (await leer()).prestadores.find((p) => p.id === prestadorId)?.cuenta;
  if (!(await dentroDelCupo("ubicaciones")) || !(await dentroDelCupoDe("ubicaciones", cuenta))) {
    return Response.json({ error: "Hoy se mandaron demasiadas ubicaciones." }, { status: 429 });
  }

  try {
    const guardada = await modificar((db) => {
      const oferta = db.ofertas.find((o) => o.id === ofertaId);
      if (!oferta || oferta.prestadorId !== prestadorId) throw new ErrorDeUbicacion("Este trabajo no es tuyo.", 403);
      const trabajo = trabajoDe(oferta);
      if (!trabajoActivo(oferta, db.pedidos.find((p) => p.id === oferta.pedidoId)) || trabajo?.estado !== "en_camino") {
        throw new ErrorDeUbicacion("La ubicación se comparte solo mientras vas en camino.", 409);
      }
      // Muy seguido no hace falta: se guarda como mucho una cada 8 segundos.
      const anterior = oferta.trabajo?.ubicacion;
      if (anterior && Date.now() - Date.parse(anterior.creado) < CADA_MS) return false;
      oferta.trabajo = { ...trabajo, ubicacion: { lat, lng, precision, creado: new Date().toISOString() } };
      return true;
    });
    return Response.json({ guardada });
  } catch (error) {
    if (error instanceof ErrorDeUbicacion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
