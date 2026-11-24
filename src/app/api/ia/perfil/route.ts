import { dentroDelCupo } from "@/lib/db";
import { armarPerfil, perfilBasico } from "@/lib/ia";


export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";

  if (texto.length < 10) {
    return Response.json({ error: "Contanos un poco más: tu nombre, qué trabajos hacés y en qué zona." }, { status: 400 });
  }
  if (texto.length > 3000) {
    return Response.json({ error: "El relato es muy largo. Resumilo en lo más importante." }, { status: 400 });
  }

  if (!(await dentroDelCupo("ia"))) {
    return Response.json({ perfil: perfilBasico(texto), fuente: "basico", aviso: "Hoy hubo demasiados pedidos y la IA está en pausa." });
  }

  const resultado = await armarPerfil(texto);
  return Response.json(resultado);
}
