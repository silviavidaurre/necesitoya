import { pagoDe } from "./pagos";
import type { BaseDeDatos } from "./tipos";

// Eliminar una cuenta, como pide Google Play y la Ley 25.326.
//
// Se BORRA: la cuenta (mail y huella de la contraseña), el perfil de prestador (fotos, billetera, celular, trámites de
// verificación con sus fotos de DNI y selfie), los pedidos (con su foto y su dirección), los presupuestos y los
// mensajes de esas conversaciones, los avisos y los celulares anotados para avisos, las denuncias que hizo y los
// bloqueos que lo nombran.
//
// Se GUARDA ANONIMIZADO (sin nombre, mail, dirección ni nada que lo identifique):
// - los registros de pagos ya hechos por la app, hasta 10 años, por obligaciones contables y para prevenir fraudes;
// - los reclamos abiertos, hasta que se resuelvan y 1 año más, para poder cerrarlos.
// Las copias de seguridad se renuevan y lo borrado desaparece de ellas en hasta 30 días.

export const PLAZOS = {
  pagos: "10 años",
  reclamos: "hasta que se resuelva y 1 año más",
  respaldos: "30 días",
};

export interface ResultadoDeBaja {
  existia: boolean;
  borrados: { cuenta: number; perfiles: number; pedidos: number; presupuestos: number; mensajes: number; avisos: number };
  anonimizados: { pedidos: number; pagos: number; reclamos: number };
  // Fotos a borrar del almacén de fotos (se borran afuera, después de guardar).
  fotos: string[];
}

export function eliminarCuenta(db: BaseDeDatos, sub: string): ResultadoDeBaja {
  const resultado: ResultadoDeBaja = {
    existia: false,
    borrados: { cuenta: 0, perfiles: 0, pedidos: 0, presupuestos: 0, mensajes: 0, avisos: 0 },
    anonimizados: { pedidos: 0, pagos: 0, reclamos: 0 },
    fotos: [],
  };
  const cuenta = db.cuentas?.find((c) => c.sub === sub);
  if (!cuenta) return resultado;
  resultado.existia = true;

  const reclamosAbiertos = new Set((db.reclamos ?? []).filter((r) => r.estado === "abierto").map((r) => r.ofertaId));
  const conPagoHecho = (ofertaId: string) => {
    const pago = pagoDe(db, ofertaId);
    return Boolean(pago && pago.estado !== "pendiente" && pago.estado !== "cancelado" && pago.estado !== "vencido");
  };
  // Un trabajo con pago hecho o con un reclamo abierto se guarda anonimizado; lo demás se borra.
  const hayQueGuardar = (ofertaId: string) => conPagoHecho(ofertaId) || reclamosAbiertos.has(ofertaId);

  const ofertasABorrar = new Set<string>();
  const ofertasAAnonimizar = new Set<string>();

  // --- Perfil de prestador --------------------------------------------------------------------------
  const prestadores = db.prestadores.filter((p) => p.cuenta === sub && !p.ejemplo);
  const idsDePrestador = new Set(prestadores.map((p) => p.id));
  for (const p of prestadores) resultado.fotos.push(...(p.fotos ?? []));
  for (const v of (db.verificaciones ?? []).filter((v) => idsDePrestador.has(v.prestadorId))) resultado.fotos.push(...v.documentos);
  db.verificaciones = (db.verificaciones ?? []).filter((v) => !idsDePrestador.has(v.prestadorId));
  for (const o of db.ofertas.filter((o) => idsDePrestador.has(o.prestadorId))) {
    if (hayQueGuardar(o.id)) ofertasAAnonimizar.add(o.id);
    else ofertasABorrar.add(o.id);
  }
  db.prestadores = db.prestadores.filter((p) => !idsDePrestador.has(p.id));
  resultado.borrados.perfiles = prestadores.length;

  // --- Pedidos del vecino ---------------------------------------------------------------------------
  const pedidosABorrar = new Set<string>();
  for (const pedido of db.pedidos.filter((p) => p.cuenta === sub)) {
    const delPedido = db.ofertas.filter((o) => o.pedidoId === pedido.id);
    const guardar = delPedido.some((o) => hayQueGuardar(o.id));
    if (pedido.fotoId) resultado.fotos.push(pedido.fotoId);
    if (!guardar) {
      pedidosABorrar.add(pedido.id);
      for (const o of delPedido) ofertasABorrar.add(o.id);
      continue;
    }
    // Se queda solo lo necesario para el pago o el reclamo, sin nada que identifique a la persona.
    pedido.cuenta = undefined;
    pedido.claveCliente = undefined;
    pedido.clienteWhatsapp = undefined;
    pedido.idCliente = undefined;
    pedido.clienteNombre = "Usuario eliminado";
    pedido.titulo = "Trabajo de una cuenta eliminada";
    pedido.descripcion = "";
    pedido.relato = "";
    pedido.fotoId = null;
    pedido.direccion = null;
    pedido.diagnostico = null;
    if (pedido.calificacion) pedido.calificacion = { ...pedido.calificacion, comentario: "" };
    resultado.anonimizados.pedidos += 1;
    for (const o of delPedido) {
      if (hayQueGuardar(o.id)) ofertasAAnonimizar.add(o.id);
    }
  }

  // --- Presupuestos, mensajes y fotos de esos trabajos ----------------------------------------------
  for (const o of db.ofertas) {
    if (ofertasABorrar.has(o.id) && o.terminado?.fotoId) resultado.fotos.push(o.terminado.fotoId);
    if (ofertasAAnonimizar.has(o.id)) o.mensaje = "";
  }
  const conversaciones = new Set([...ofertasABorrar, ...ofertasAAnonimizar]);
  const mensajesAntes = (db.mensajes ?? []).length;
  db.mensajes = (db.mensajes ?? []).filter((m) => !conversaciones.has(m.ofertaId));
  resultado.borrados.mensajes = mensajesAntes - db.mensajes.length;
  resultado.borrados.presupuestos = db.ofertas.filter((o) => ofertasABorrar.has(o.id)).length;
  db.ofertas = db.ofertas.filter((o) => !ofertasABorrar.has(o.id));
  resultado.borrados.pedidos = pedidosABorrar.size;
  db.pedidos = db.pedidos.filter((p) => !pedidosABorrar.has(p.id));

  // Pagos de trabajos borrados (nunca pagados) se van; los hechos quedan, sin datos personales.
  db.pagos = (db.pagos ?? []).filter((p) => !ofertasABorrar.has(p.ofertaId));
  resultado.anonimizados.pagos = (db.pagos ?? []).filter((p) => ofertasAAnonimizar.has(p.ofertaId)).length;

  // Reclamos: los abiertos quedan para poder resolverlos; los demás de esos trabajos se borran con sus fotos.
  for (const r of db.reclamos ?? []) {
    if (!conversaciones.has(r.ofertaId)) continue;
    if (r.estado === "abierto") resultado.anonimizados.reclamos += 1;
    else resultado.fotos.push(...r.fotos);
  }
  db.reclamos = (db.reclamos ?? []).filter((r) => !conversaciones.has(r.ofertaId) || r.estado === "abierto");

  // --- Avisos, denuncias, bloqueos y la cuenta ------------------------------------------------------
  const avisosAntes = (db.avisos ?? []).length + (db.suscripciones ?? []).length;
  db.avisos = (db.avisos ?? []).filter((a) => a.cuenta !== sub);
  db.suscripciones = (db.suscripciones ?? []).filter((s) => s.cuenta !== sub);
  resultado.borrados.avisos = avisosAntes - db.avisos.length - db.suscripciones.length;
  const idsPublicos = new Set(prestadores.map((p) => p.idPublico));
  db.denuncias = (db.denuncias ?? []).filter((d) => d.cuenta !== sub && !idsPublicos.has(d.objetivo));
  for (const otra of db.cuentas ?? []) {
    if (!otra.bloqueos) continue;
    otra.bloqueos = otra.bloqueos.filter((b) => b !== `c:${sub}` && ![...idsDePrestador].some((id) => b === `p:${id}`));
  }
  db.cuentas = (db.cuentas ?? []).filter((c) => c.sub !== sub);
  resultado.borrados.cuenta = 1;

  // Pedidos de baja hechos desde la página pública para esta cuenta: quedan resueltos.
  const email = cuenta.email;
  for (const b of db.bajas ?? []) {
    if (email && b.email === email && b.estado === "pendiente") {
      b.estado = "hecha";
      b.resuelta = new Date().toISOString();
    }
  }
  resultado.fotos = [...new Set(resultado.fotos)];
  return resultado;
}
