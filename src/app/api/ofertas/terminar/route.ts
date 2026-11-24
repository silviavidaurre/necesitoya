import { dentroDelCupo, dentroDelCupoDe, guardarFoto, leer, modificar, nuevoId } from "@/lib/db";
import { fotoValida } from "@/lib/fotos";
import { avisar } from "@/lib/avisos";
import { pasarA } from "@/lib/trabajo";

class ErrorDeCierre extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// El prestador elegido marca "Trabajo terminado", con la foto del después. El vecino después confirma.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const prestadorId = typeof cuerpo?.prestadorId === "string" ? cuerpo.prestadorId : "";
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  if (!prestadorId || !ofertaId) return Response.json({ error: "Faltan datos." }, { status: 400 });

  let foto;
  try {
    foto = fotoValida(cuerpo?.foto);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  if (!foto) return Response.json({ error: "Sacale una foto a cómo quedó el trabajo." }, { status: 400 });

  // Se revisa antes de guardar la foto, para que nadie llene la base con fotos sueltas.
  const db = await leer();
  const oferta = db.ofertas.find((o) => o.id === ofertaId);
  if (!oferta || oferta.prestadorId !== prestadorId) return Response.json({ error: "Este trabajo no es tuyo." }, { status: 403 });
  if (oferta.estado !== "elegida") return Response.json({ error: "Solo se cierra un trabajo en el que te eligieron." }, { status: 409 });
  if (oferta.terminado) return Response.json({ error: "Ya marcaste este trabajo como terminado." }, { status: 409 });
  const prestador = db.prestadores.find((p) => p.id === prestadorId);
  if (!(await dentroDelCupo("fotos")) || !(await dentroDelCupoDe("fotos", prestador?.cuenta))) {
    return Response.json({ error: "Hoy se subieron demasiadas fotos. Probá de nuevo mañana." }, { status: 429 });
  }

  const fotoId = nuevoId();
  await guardarFoto(fotoId, foto);
  try {
    const resultado = await modificar((actual) => {
      const o = actual.ofertas.find((x) => x.id === ofertaId);
      if (!o || o.prestadorId !== prestadorId) throw new ErrorDeCierre("Este trabajo no es tuyo.", 403);
      if (o.terminado) throw new ErrorDeCierre("Ya marcaste este trabajo como terminado.", 409);
      o.terminado = { creado: new Date().toISOString(), fotoId };
      // Desde acá el prestador deja de ver la dirección.
      pasarA(o, "terminado");
      return { terminado: o.terminado, cuenta: actual.pedidos.find((p) => p.id === o.pedidoId)?.cuenta };
    });
    avisar(resultado.cuenta, { tipo: "terminado", titulo: "Trabajo terminado", texto: "Mirá la foto y confirmá si quedó bien.", url: `/pedido/${oferta.pedidoId}` });
    return Response.json({ terminado: resultado.terminado });
  } catch (error) {
    if (error instanceof ErrorDeCierre) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
