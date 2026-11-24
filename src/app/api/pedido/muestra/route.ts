import { MAX_OFERTAS } from "@/lib/catalogo";
import { asegurarPrestadoresDeMuestra, modificar, nuevoId } from "@/lib/db";
import { seguimientoDe } from "@/lib/seguimiento";
import type { Oferta } from "@/lib/tipos";

class ErrorDeMuestra extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

const MENSAJES = [
  "Puedo pasar a verlo y lo dejo andando en el día. Llevo mis herramientas.",
  "Hago ese trabajo seguido. Te paso el precio de la mano de obra; los materiales los vemos ahí.",
];

// El vecino pide ver cómo se ve su pedido con presupuestos de muestra (para probar la app con un solo celular).
// Solo se hace cuando él lo pide: los presupuestos quedan marcados como de muestra, los mandan prestadores
// inventados sin WhatsApp, y el pedido deja de contar como uso real.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  if (!id || !clave) return Response.json({ error: "Faltan datos del pedido." }, { status: 400 });

  try {
    const seguimiento = await modificar((db) => {
      const pedido = db.pedidos.find((p) => p.id === id);
      if (!pedido) throw new ErrorDeMuestra("No encontramos ese pedido.", 404);
      if (!pedido.claveCliente || pedido.claveCliente !== clave) throw new ErrorDeMuestra("Este pedido no es tuyo.", 403);
      if (pedido.estado !== "abierto") throw new ErrorDeMuestra("Este pedido ya está cerrado.", 409);

      const delPedido = db.ofertas.filter((o) => o.pedidoId === id);
      const lugares = Math.min(2, MAX_OFERTAS - delPedido.length);
      if (lugares <= 0) throw new ErrorDeMuestra("Este pedido ya tiene todos sus presupuestos.", 409);

      const deMuestra = asegurarPrestadoresDeMuestra(db).filter((p) => !delPedido.some((o) => o.prestadorId === p.id));
      // Primero los que hacen ese oficio; si no alcanza, cualquiera de los de muestra.
      const elegidos = [...deMuestra.filter((p) => p.rubros.includes(pedido.rubro)), ...deMuestra.filter((p) => !p.rubros.includes(pedido.rubro))].slice(0, lugares);

      const minimo = pedido.precioMin ?? 40000;
      const maximo = pedido.precioMax ?? Math.round(minimo * 1.6);
      elegidos.forEach((prestador, i) => {
        const precio = Math.round((minimo + (maximo - minimo) * (i === 0 ? 0.35 : 0.75)) / 1000) * 1000;
        const oferta: Oferta = {
          id: nuevoId(),
          pedidoId: id,
          prestadorId: prestador.id,
          precio,
          cuando: i === 0 ? "Hoy" : "Mañana",
          mensaje: MENSAJES[i % MENSAJES.length],
          estado: "enviada",
          creado: new Date(Date.now() + i).toISOString(),
          ejemplo: true,
        };
        db.ofertas.push(oferta);
      });

      pedido.conMuestra = true;
      return seguimientoDe(db, pedido);
    });
    return Response.json(seguimiento);
  } catch (error) {
    if (error instanceof ErrorDeMuestra) return Response.json({ error: error.message }, { status: error.estado });
    throw error;
  }
}
