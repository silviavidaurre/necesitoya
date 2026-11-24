import { dentroDelCupo, dentroDelCupoDe, guardarFoto, leer, modificar, nuevoId } from "@/lib/db";
import { fotoValida } from "@/lib/fotos";
import { PREFIJO_PRIVADO } from "@/lib/moderacion";
import { limpiarTexto } from "@/lib/texto";
import type { Verificacion } from "@/lib/tipos";

// Verificación del prestador, revisada a mano por el equipo:
// - dni: foto del frente del DNI y una selfie sosteniéndolo.
// - matricula: foto de la matrícula o del certificado del oficio, con su número si tiene.
// Las fotos se guardan como privadas: solo las ve el panel de moderación. El id secreto del prestador es la llave.

class ErrorDeVerificacion extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// Cómo van sus trámites: sin fotos, solo el estado.
export async function GET(request: Request) {
  const prestadorId = new URL(request.url).searchParams.get("prestadorId") ?? "";
  const db = await leer();
  const prestador = db.prestadores.find((p) => p.id === prestadorId);
  if (!prestador) return Response.json({ error: "No encontramos tu perfil." }, { status: 404 });
  const tramites = (db.verificaciones ?? [])
    .filter((v) => v.prestadorId === prestadorId)
    .sort((a, b) => b.creado.localeCompare(a.creado))
    .map((v) => ({ tipo: v.tipo, estado: v.estado, motivo: v.motivo ?? "", creado: v.creado }));
  return Response.json({ nivel: prestador.nivel, tramites });
}

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const prestadorId = typeof cuerpo?.prestadorId === "string" ? cuerpo.prestadorId : "";
  const tipo = cuerpo?.tipo === "dni" || cuerpo?.tipo === "matricula" ? (cuerpo.tipo as Verificacion["tipo"]) : null;
  if (!prestadorId || !tipo) return Response.json({ error: "Faltan datos." }, { status: 400 });

  const crudas: unknown[] = Array.isArray(cuerpo?.documentos) ? cuerpo.documentos.slice(0, 2) : [];
  let fotos;
  try {
    fotos = crudas.map((f) => fotoValida(f)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  if (tipo === "dni" && fotos.length < 2) return Response.json({ error: "Faltan las dos fotos: el frente del DNI y tu selfie con el DNI." }, { status: 400 });
  if (tipo === "matricula" && fotos.length < 1) return Response.json({ error: "Falta la foto de la matrícula o del certificado." }, { status: 400 });

  const db = await leer();
  const prestador = db.prestadores.find((p) => p.id === prestadorId);
  if (!prestador || prestador.ejemplo) return Response.json({ error: "No encontramos tu perfil." }, { status: 404 });
  if (!prestador.cuenta) return Response.json({ error: "Entrá con tu cuenta para verificarte." }, { status: 401 });
  const previas = (db.verificaciones ?? []).filter((v) => v.prestadorId === prestadorId && v.tipo === tipo);
  if (previas.some((v) => v.estado === "pendiente")) return Response.json({ error: "Ya mandaste este trámite. Lo estamos revisando." }, { status: 409 });
  if (previas.some((v) => v.estado === "aprobada")) return Response.json({ error: "Ya está verificado." }, { status: 409 });
  if (!(await dentroDelCupo("fotos")) || !(await dentroDelCupoDe("fotos", prestador.cuenta))) {
    return Response.json({ error: "Hoy se subieron demasiadas fotos. Probá de nuevo mañana." }, { status: 429 });
  }

  const documentos: string[] = [];
  for (const foto of fotos) {
    const id = `${PREFIJO_PRIVADO}${nuevoId()}`;
    await guardarFoto(id, foto);
    documentos.push(id);
  }

  try {
    const tramite = await modificar((actual) => {
      const ya = (actual.verificaciones ?? []).some((v) => v.prestadorId === prestadorId && v.tipo === tipo && v.estado !== "rechazada");
      if (ya) throw new ErrorDeVerificacion("Ya mandaste este trámite. Lo estamos revisando.", 409);
      const nuevo: Verificacion = {
        id: nuevoId(),
        prestadorId,
        tipo,
        documentos,
        numero: limpiarTexto(cuerpo?.numero, 40) || undefined,
        estado: "pendiente",
        creado: new Date().toISOString(),
      };
      actual.verificaciones = [...(actual.verificaciones ?? []), nuevo];
      return nuevo;
    });
    return Response.json({ tipo: tramite.tipo, estado: tramite.estado, creado: tramite.creado }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorDeVerificacion) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
