import { dentroDelCupo } from "@/lib/db";
import { ErrorDeVoz, MAXIMO_TEXTO, decir } from "@/lib/voz";

// Lee en voz alta un texto corto. Devuelve el audio en MP3.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.replace(/\s+/g, " ").trim() : "";

  if (texto.length < 2) return Response.json({ error: "No hay nada para leer." }, { status: 400 });
  if (texto.length > MAXIMO_TEXTO) {
    return Response.json({ error: "El texto es muy largo para leerlo en voz alta." }, { status: 413 });
  }

  if (!(await dentroDelCupo("voz"))) return Response.json({ error: "La voz no está disponible por hoy." }, { status: 429 });

  try {
    const audio = await decir(texto);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeVoz) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
