import { avisar } from "@/lib/avisos";
import { modificar } from "@/lib/db";
import { pasarA, trabajoActivo, trabajoDe } from "@/lib/trabajo";
import { siguienteEstado, textoDeEstado, type EstadoDeTrabajo } from "@/lib/turnos";

class ErrorDeEstado extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

const TEXTO_PARA_EL_VECINO: Partial<Record<EstadoDeTrabajo, string>> = {
  en_camino: "salió para tu casa",
  llego: "llegó",
  trabajando: "empezó el trabajo",
};

// El prestador elegido avanza el estado del trabajo, de a un paso: Confirmado → En camino → Llegó → Trabajando.
// "Terminado" va por /api/ofertas/terminar, con la foto del después. Cada paso le avisa al vecino.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const prestadorId = typeof cuerpo?.prestadorId === "string" ? cuerpo.prestadorId : "";
  const ofertaId = typeof cuerpo?.ofertaId === "string" ? cuerpo.ofertaId : "";
  const pedido = String(cuerpo?.estado ?? "") as EstadoDeTrabajo;
  if (!prestadorId || !ofertaId) return Response.json({ error: "Faltan datos." }, { status: 400 });

  try {
    const resultado = await modificar((db) => {
      const oferta = db.ofertas.find((o) => o.id === ofertaId);
      if (!oferta || oferta.prestadorId !== prestadorId) throw new ErrorDeEstado("Este trabajo no es tuyo.", 403);
      const delPedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
      if (!trabajoActivo(oferta, delPedido)) throw new ErrorDeEstado("Este trabajo ya no está activo.", 409);
      const actual = trabajoDe(oferta)?.estado ?? "confirmado";
      const siguiente = siguienteEstado(actual);
      if (!siguiente || pedido !== siguiente) throw new ErrorDeEstado(`Ahora el paso que sigue es "${siguiente ? textoDeEstado(siguiente) : "ninguno"}".`, 409);
      if (siguiente === "terminado") throw new ErrorDeEstado("Para terminar, mandá la foto del después.", 409);
      pasarA(oferta, siguiente);
      const prestador = db.prestadores.find((p) => p.id === prestadorId);
      return { trabajo: oferta.trabajo, cuenta: delPedido?.cuenta, pedidoId: oferta.pedidoId, quien: prestador?.nombre.split(" ")[0] ?? "El prestador", estado: siguiente };
    });
    avisar(resultado.cuenta, {
      tipo: "mensaje",
      titulo: textoDeEstado(resultado.estado),
      texto: `${resultado.quien} ${TEXTO_PARA_EL_VECINO[resultado.estado] ?? textoDeEstado(resultado.estado).toLowerCase()}.`,
      url: `/pedido/${resultado.pedidoId}`,
    });
    return Response.json({ trabajo: resultado.trabajo });
  } catch (error) {
    if (error instanceof ErrorDeEstado) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
