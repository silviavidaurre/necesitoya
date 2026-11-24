import { fotoValida } from "@/lib/fotos";
import { conexionDe, dentroDelCupo, dentroDelCupoDe } from "@/lib/db";
import { armarPedido, pedidoBasico } from "@/lib/ia";

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";

  let foto;
  try {
    foto = fotoValida(cuerpo?.foto);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  if (texto.length < 5 && !foto) {
    return Response.json({ error: "Contanos qué necesitás o sacale una foto al problema." }, { status: 400 });
  }
  if (texto.length > 3000) {
    return Response.json({ error: "El relato es muy largo. Resumilo en lo más importante." }, { status: 400 });
  }

  if (!(await dentroDelCupo("ia")) || !(await dentroDelCupoDe("iaPorConexion", conexionDe(request)))) {
    return Response.json({ pedido: pedidoBasico(texto), fuente: "basico", aviso: "Hoy hubo demasiados pedidos y la IA está en pausa." });
  }

  const resultado = await armarPedido(texto, foto ?? undefined);
  return Response.json(resultado);
}
