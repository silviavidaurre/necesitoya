import { MAX_LARGO_MENSAJE, MAX_MENSAJES_POR_CHAT, mensajesDe, motivoDeCierre, ocultarContacto, type Lado } from "@/lib/chat";
import { avisar } from "@/lib/avisos";
import { dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";
import type { BaseDeDatos, Mensaje, Oferta } from "@/lib/tipos";

// Chat de un presupuesto: una conversación por oferta, entre el vecino dueño del pedido y el prestador que la mandó.
// Es el único canal de contacto: acá nunca salen teléfonos, claves de pedidos ni ids secretos de prestadores.

class ErrorDeChat extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

interface Credenciales {
  ofertaId: string;
  pedidoId: string;
  clave: string;
  prestadorId: string;
}

function texto(valor: unknown) {
  return typeof valor === "string" ? valor : "";
}

// Busca la oferta y dice de qué lado está quien pregunta. El prestador entra con su id secreto;
// el vecino, con el id de su pedido y la clave. Cualquier otro recibe un 403.
function entrar(db: BaseDeDatos, quien: Credenciales): { oferta: Oferta; lado: Lado } {
  const oferta = db.ofertas.find((o) => o.id === quien.ofertaId);
  if (!oferta) throw new ErrorDeChat("No encontramos esa conversación.", 404);

  if (quien.prestadorId) {
    if (oferta.prestadorId !== quien.prestadorId) throw new ErrorDeChat("Esta conversación no es tuya.", 403);
    return { oferta, lado: "prestador" };
  }
  const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
  const esDuenio = Boolean(quien.pedidoId && quien.clave && pedido && pedido.id === quien.pedidoId && pedido.claveCliente && pedido.claveCliente === quien.clave);
  if (!esDuenio) throw new ErrorDeChat("Esta conversación no es tuya.", 403);
  return { oferta, lado: "vecino" };
}

// Lo que ve cada lado: los mensajes, con quién habla (solo el nombre de pila) y si todavía puede escribir.
function vista(db: BaseDeDatos, oferta: Oferta, lado: Lado, desde: string) {
  const pedido = db.pedidos.find((p) => p.id === oferta.pedidoId);
  const prestador = db.prestadores.find((p) => p.id === oferta.prestadorId);
  const otro = lado === "vecino" ? (prestador?.nombre ?? "") : (pedido?.clienteNombre ?? "");
  const todos = mensajesDe(db, oferta.id).sort((a, b) => a.creado.localeCompare(b.creado));
  const motivo = motivoDeCierre(db, oferta);
  return {
    soy: lado,
    con: { nombre: otro.split(" ")[0] },
    pedido: { titulo: pedido?.titulo ?? "" },
    mensajes: desde ? todos.filter((m) => m.creado > desde) : todos,
    abierto: motivo === "" && todos.length < MAX_MENSAJES_POR_CHAT,
    motivo: motivo || (todos.length >= MAX_MENSAJES_POR_CHAT ? "lleno" : ""),
  };
}

function responderError(error: unknown) {
  if (error instanceof ErrorDeChat) return Response.json({ error: error.message }, { status: error.estado });
  throw error;
}

// Trae los mensajes (todos, o solo los posteriores a `desde`) y anota que este lado ya los leyó.
export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const quien: Credenciales = {
    ofertaId: parametros.get("ofertaId") ?? "",
    pedidoId: parametros.get("pedidoId") ?? "",
    clave: parametros.get("clave") ?? "",
    prestadorId: parametros.get("prestadorId") ?? "",
  };
  const desde = parametros.get("desde") ?? "";
  if (!quien.ofertaId) return Response.json({ error: "Falta el presupuesto." }, { status: 400 });

  try {
    const db = await leer();
    const { oferta, lado } = entrar(db, quien);
    const leido = (lado === "vecino" ? oferta.leidoVecino : oferta.leidoPrestador) ?? "";
    const hayNuevos = mensajesDe(db, oferta.id).some((m) => m.de !== lado && m.creado > leido);
    // Solo se escribe en la base cuando hay algo nuevo que marcar como leído: esta consulta se repite cada pocos segundos.
    if (!hayNuevos) return Response.json(vista(db, oferta, lado, desde));

    const respuesta = await modificar((fresco) => {
      const actual = entrar(fresco, quien);
      const ahora = new Date().toISOString();
      if (actual.lado === "vecino") actual.oferta.leidoVecino = ahora;
      else actual.oferta.leidoPrestador = ahora;
      return vista(fresco, actual.oferta, actual.lado, desde);
    });
    return Response.json(respuesta);
  } catch (error) {
    return responderError(error);
  }
}

// Manda un mensaje. Los teléfonos y enlaces de WhatsApp se tapan antes de guardarlo, y la respuesta avisa si pasó.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const quien: Credenciales = {
    ofertaId: texto(cuerpo?.ofertaId),
    pedidoId: texto(cuerpo?.pedidoId),
    clave: texto(cuerpo?.clave),
    prestadorId: texto(cuerpo?.prestadorId),
  };
  if (!quien.ofertaId) return Response.json({ error: "Falta el presupuesto." }, { status: 400 });

  const limpio = ocultarContacto(limpiarTexto(cuerpo?.texto, MAX_LARGO_MENSAJE));
  const contenido = limpio.texto.slice(0, MAX_LARGO_MENSAJE);

  try {
    // Primero se revisa quién es, sin gastar cupo: un extraño no le saca lugar a los demás.
    const antes = await leer();
    const yo = entrar(antes, quien);
    if (!contenido) return Response.json({ error: "Escribí el mensaje." }, { status: 400 });
    const pedidoDelChat = antes.pedidos.find((p) => p.id === yo.oferta.pedidoId);
    const prestadorDelChat = antes.prestadores.find((p) => p.id === yo.oferta.prestadorId);
    const miCuenta = yo.lado === "vecino" ? pedidoDelChat?.cuenta : prestadorDelChat?.cuenta;
    if (!(await dentroDelCupo("mensajes")) || !(await dentroDelCupoDe("mensajes", miCuenta))) {
      return Response.json({ error: "Hoy se mandaron demasiados mensajes. Probá de nuevo mañana." }, { status: 429 });
    }

    const mensaje = await modificar((db) => {
      const { oferta, lado } = entrar(db, quien);
      const motivo = motivoDeCierre(db, oferta);
      if (motivo === "muestra") throw new ErrorDeChat("Es un presupuesto de muestra: no hay nadie del otro lado.", 409);
      if (motivo === "descartada") throw new ErrorDeChat("Este presupuesto no fue el elegido. El chat quedó solo para leer.", 409);
      if (motivo === "bloqueado") throw new ErrorDeChat("Esta conversación está bloqueada.", 409);
      if (motivo === "cancelado") throw new ErrorDeChat("El pedido se canceló. El chat quedó solo para leer.", 409);

      const anteriores = mensajesDe(db, oferta.id);
      if (anteriores.length >= MAX_MENSAJES_POR_CHAT) {
        throw new ErrorDeChat("Esta conversación llegó al máximo de mensajes.", 409);
      }
      // Cada mensaje queda con una fecha posterior a la del anterior: así "traer los nuevos desde" no se saltea ninguno.
      const ultimo = anteriores.reduce((mayor, m) => (m.creado > mayor ? m.creado : mayor), "");
      let creado = new Date().toISOString();
      if (ultimo && creado <= ultimo) creado = new Date(Date.parse(ultimo) + 1).toISOString();

      const nuevo: Mensaje = { id: nuevoId(), ofertaId: oferta.id, de: lado, texto: contenido, creado };
      db.mensajes = [...(db.mensajes ?? []), nuevo];
      // Quien escribe ya vio lo anterior.
      if (lado === "vecino") oferta.leidoVecino = creado;
      else oferta.leidoPrestador = creado;
      return nuevo;
    });

    // Aviso al otro lado: al prestador lo lleva a sus presupuestos; al vecino, a su pedido.
    if (yo.lado === "vecino") {
      avisar(prestadorDelChat?.cuenta, { tipo: "mensaje", titulo: `Mensaje de ${pedidoDelChat?.clienteNombre.split(" ")[0] ?? "un vecino"}`, texto: contenido.slice(0, 120), url: "/prestador/ofertas" });
    } else {
      avisar(pedidoDelChat?.cuenta, { tipo: "mensaje", titulo: `Mensaje de ${prestadorDelChat?.nombre.split(" ")[0] ?? "un prestador"}`, texto: contenido.slice(0, 120), url: `/pedido/${yo.oferta.pedidoId}` });
    }
    return Response.json({ mensaje, oculto: limpio.oculto }, { status: 201 });
  } catch (error) {
    return responderError(error);
  }
}
