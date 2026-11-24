import { conexionDe, dentroDelCupo, dentroDelCupoDe, modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";

// Pedido de eliminar una cuenta SIN entrar a la app (página pública /eliminar-cuenta, como pide Google Play).
// Se registra para que el equipo lo resuelva en /admin. La respuesta es siempre la misma, exista o no la cuenta:
// así nadie puede usar esta página para averiguar si un mail está registrado.
const MAIL_VALIDO = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const email = limpiarTexto(cuerpo?.email, 120).toLowerCase();
  if (!MAIL_VALIDO.test(email)) return Response.json({ error: "Escribí el mail de tu cuenta." }, { status: 400 });
  if (!(await dentroDelCupo("bajas")) || !(await dentroDelCupoDe("bajasPorConexion", conexionDe(request)))) {
    return Response.json({ error: "Hubo demasiados pedidos. Probá de nuevo mañana o escribinos." }, { status: 429 });
  }
  await modificar((db) => {
    const ya = (db.bajas ?? []).some((b) => b.email === email && b.estado === "pendiente");
    if (ya) return;
    db.bajas = [...(db.bajas ?? []), { id: nuevoId(), email, estado: "pendiente", creado: new Date().toISOString() }];
  });
  return Response.json({ recibido: true, plazo: "Lo resolvemos en hasta 7 días hábiles." }, { status: 201 });
}
