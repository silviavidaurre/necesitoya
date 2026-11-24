import { MAX_OFERTAS, RUBRO_IDS, type RubroId } from "@/lib/catalogo";
import { cuentaDe, dentroDelCupo, guardarFoto, leer, modificar, nuevoId, pedidoPublico } from "@/lib/db";
import { fotoValida } from "@/lib/fotos";
import { cubreZona, minutosDeReserva } from "@/lib/reglas";
import { limpiarTexto as texto } from "@/lib/texto";
import type { Pedido, PedidoParaPrestador, Urgencia } from "@/lib/tipos";

const URGENCIAS: Urgencia[] = ["hoy", "semana", "flexible"];

function precio(valor: unknown) {
  const numero = Math.round(Number(valor));
  return Number.isFinite(numero) && numero >= 1000 && numero <= 50_000_000 ? numero : null;
}

// Pedidos abiertos, vistos por un prestador: primero los de su oficio y zona, después los más nuevos.
// Nunca incluye el teléfono del vecino ni su clave de seguimiento.
export async function GET(request: Request) {
  const prestadorId = new URL(request.url).searchParams.get("prestadorId");
  const db = await leer();
  const prestador = prestadorId ? db.prestadores.find((p) => p.id === prestadorId) : undefined;

  const pedidos: PedidoParaPrestador[] = db.pedidos
    .filter((pedido) => pedido.estado === "abierto")
    .map((pedido) => {
      // Los presupuestos de muestra no ocupan lugar ni se cuentan: son solo para que el vecino pruebe.
      const ofertas = db.ofertas.filter((o) => o.pedidoId === pedido.id && !o.ejemplo);
      const coincide = Boolean(prestador && prestador.rubros.includes(pedido.rubro));
      const esDelBarrio = Boolean(prestador && cubreZona(prestador, pedido.zona));
      // El último lugar queda guardado un rato para prestadores del barrio.
      const reservadoMin = esDelBarrio ? 0 : minutosDeReserva(pedido, ofertas.length);
      return {
        ...pedidoPublico(pedido),
        ofertas: ofertas.length,
        // Los pedidos de ejemplo son para practicar: siempre tienen lugar.
        cupos: pedido.ejemplo ? MAX_OFERTAS : reservadoMin > 0 ? 0 : Math.max(0, MAX_OFERTAS - ofertas.length),
        yaOferte: Boolean(prestador && ofertas.some((o) => o.prestadorId === prestador.id)),
        coincide,
        enMiZona: coincide && esDelBarrio,
        reservadoMin,
      };
    })
    // Los pedidos reales van antes que los de ejemplo; después por oficio y zona, y por fecha.
    .sort(
      (a, b) =>
        Number(a.ejemplo) - Number(b.ejemplo) ||
        Number(b.enMiZona) - Number(a.enMiZona) ||
        Number(b.coincide) - Number(a.coincide) ||
        b.creado.localeCompare(a.creado),
    );

  return Response.json({ pedidos });
}

// Un vecino publica su pedido. Devuelve el id y una clave que solo él conoce para seguirlo.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") return Response.json({ error: "Datos inválidos." }, { status: 400 });

  const titulo = texto(cuerpo.titulo, 80);
  const descripcion = texto(cuerpo.descripcion, 500);
  const zona = texto(cuerpo.zona, 60);
  const rubro = (RUBRO_IDS as string[]).includes(cuerpo.rubro) ? (cuerpo.rubro as RubroId) : null;
  const urgencia = URGENCIAS.includes(cuerpo.urgencia) ? (cuerpo.urgencia as Urgencia) : "semana";
  const clienteNombre = texto(cuerpo.clienteNombre, 60);
  // El teléfono ya no se pide: el contacto es por el chat de la app. Si llega uno completo se guarda, pero nunca se muestra.
  const telefono = texto(cuerpo.clienteWhatsapp, 30).replace(/[^\d+]/g, "");
  const clienteWhatsapp = telefono.replace(/\D/g, "").length >= 8 ? telefono : undefined;

  if (titulo.length < 4) return Response.json({ error: "Falta contar qué necesitás." }, { status: 400 });
  if (!rubro) return Response.json({ error: "Elegí qué tipo de trabajo es." }, { status: 400 });
  if (!zona) return Response.json({ error: "Decinos en qué barrio es." }, { status: 400 });
  if (clienteNombre.length < 2) return Response.json({ error: "Falta tu nombre." }, { status: 400 });

  let foto;
  try {
    foto = fotoValida(cuerpo.foto);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  if (!(await dentroDelCupo("pedidos")) || (foto && !(await dentroDelCupo("fotos")))) {
    return Response.json({ error: "Hoy se publicaron demasiados pedidos. Probá de nuevo mañana." }, { status: 429 });
  }

  const fotoId = foto ? nuevoId() : null;
  if (foto && fotoId) await guardarFoto(fotoId, foto);

  const minimo = precio(cuerpo.precioMin);
  const maximo = precio(cuerpo.precioMax);
  const hayRango = minimo !== null && maximo !== null && maximo >= minimo;
  const pedido: Pedido = {
    id: nuevoId(),
    titulo,
    descripcion: descripcion || titulo,
    rubro,
    zona,
    urgencia,
    precioMin: hayRango ? minimo : null,
    precioMax: hayRango ? maximo : null,
    clienteNombre,
    ejemplo: false,
    estado: "abierto",
    creado: new Date().toISOString(),
    relato: texto(cuerpo.relato, 1000),
    fotoId,
    clienteWhatsapp,
    claveCliente: nuevoId(),
    idCliente: texto(cuerpo.idCliente, 64) || undefined,
  };

  // Si este mismo intento ya se guardó (la respuesta se perdió y el celular reintentó), se devuelve el que existe.
  const guardado = await modificar((db) => {
    const repetido = pedido.idCliente ? db.pedidos.find((p) => p.idCliente === pedido.idCliente) : undefined;
    if (repetido) return repetido;
    pedido.cuenta = cuentaDe(db, cuerpo.cuenta);
    db.pedidos.push(pedido);
    return pedido;
  });

  return Response.json({ id: guardado.id, clave: guardado.claveCliente }, { status: 201 });
}
