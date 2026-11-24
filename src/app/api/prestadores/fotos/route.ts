import { dentroDelCupo, guardarFoto, leer, modificar, nuevoId } from "@/lib/db";
import { fotoValida } from "@/lib/fotos";
import { MAX_FOTOS } from "@/lib/reglas";

class ErrorDeFoto extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// Fotos de trabajos hechos, para el perfil del prestador. Con `foto` suma una; con `quitar` saca una.
// El `id` es el secreto del prestador: solo él puede cambiar sus fotos.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const quitar = typeof cuerpo?.quitar === "string" ? cuerpo.quitar : "";
  if (!id) return Response.json({ error: "Falta el perfil." }, { status: 400 });

  let foto;
  try {
    foto = fotoValida(cuerpo?.foto);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  if (!foto && !quitar) return Response.json({ error: "Falta la foto." }, { status: 400 });

  // Se comprueba el perfil y el cupo ANTES de guardar la foto: si no, un id inventado
  // dejaría fotos sueltas ocupando lugar en la base.
  const db = await leer();
  const existente = db.prestadores.find((p) => p.id === id);
  if (!existente) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
  if (foto && (existente.fotos ?? []).length >= MAX_FOTOS) {
    return Response.json({ error: `Podés tener hasta ${MAX_FOTOS} fotos. Quitá una para sumar otra.` }, { status: 409 });
  }

  if (foto && !(await dentroDelCupo("fotos"))) {
    return Response.json({ error: "Hoy se subieron demasiadas fotos. Probá de nuevo mañana." }, { status: 429 });
  }

  try {
    const fotoId = foto ? nuevoId() : "";
    if (foto) await guardarFoto(fotoId, foto);

    const fotos = await modificar((actual) => {
      const prestador = actual.prestadores.find((p) => p.id === id);
      if (!prestador) throw new ErrorDeFoto("No encontramos ese perfil.", 404);
      const actuales = prestador.fotos ?? [];
      if (quitar) {
        prestador.fotos = actuales.filter((f) => f !== quitar);
      } else {
        if (actuales.length >= MAX_FOTOS) throw new ErrorDeFoto(`Podés tener hasta ${MAX_FOTOS} fotos. Quitá una para sumar otra.`, 409);
        prestador.fotos = [...actuales, fotoId];
      }
      return prestador.fotos;
    });
    return Response.json({ fotos });
  } catch (error) {
    if (error instanceof ErrorDeFoto) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
