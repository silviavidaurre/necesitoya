import { conexionDe, dentroDelCupo, dentroDelCupoDe } from "@/lib/db";
import { ErrorDeVoz, audioValido, transcribir } from "@/lib/voz";

// Pasa a texto un audio corto grabado en el navegador. Es el dictado de los celulares que no traen uno propio.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  try {
    const audio = audioValido(cuerpo);
    if (!(await dentroDelCupo("voz")) || !(await dentroDelCupoDe("vozPorConexion", conexionDe(request)))) {
      return Response.json({ error: "El dictado no está disponible por hoy. Escribilo con el teclado." }, { status: 429 });
    }
    const texto = await transcribir(audio);
    return Response.json({ texto });
  } catch (error) {
    if (error instanceof ErrorDeVoz) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
