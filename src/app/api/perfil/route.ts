import { leer } from "@/lib/db";
import { perfilPublico } from "@/lib/reglas";

// Perfil público de un prestador: lo que ve cualquiera que abre su enlace. Sin WhatsApp.
// Se busca SOLO por el id público; el id secreto no sirve acá, para que nadie pueda probar si un id es válido.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el id." }, { status: 400 });

  const db = await leer();
  const prestador = db.prestadores.find((p) => p.idPublico === id);
  if (!prestador) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });

  return Response.json({ perfil: perfilPublico(db, prestador) });
}
