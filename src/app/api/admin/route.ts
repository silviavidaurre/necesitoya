import { comprobarAdmin } from "@/lib/admin";
import { mensajesDe } from "@/lib/chat";
import { PLAZOS, eliminarCuenta } from "@/lib/bajas";
import { borrarFotos, esCuentaDePrueba, leer, modificar } from "@/lib/db";
import { huellasDeRevision, prepararRevision } from "@/lib/revision";
import { metricas } from "@/lib/metricas";
import { nivelDe } from "@/lib/moderacion";
import { pagoDe } from "@/lib/pagos";
import { limpiarTexto } from "@/lib/texto";
import type { BaseDeDatos } from "@/lib/tipos";

// Panel interno de moderación y métricas. Todo pide el secreto de administración (encabezado x-admin).
// Lo que se muestra acá es lo mínimo para decidir: nunca contraseñas, huellas, mails ni teléfonos.

function conversacion(db: BaseDeDatos, ofertaId: string | undefined) {
  if (!ofertaId) return [];
  return mensajesDe(db, ofertaId)
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .map((m) => ({ id: m.id, de: m.de, texto: m.texto, creado: m.creado }));
}

// Lo que crearon las cuentas de las pruebas automáticas (mails .test): pedidos, perfiles y todo lo que cuelga de ellos.
function deLasPruebas(db: BaseDeDatos) {
  const pedidos = new Set(db.pedidos.filter((p) => esCuentaDePrueba(p.cuenta)).map((p) => p.id));
  const prestadores = new Set(db.prestadores.filter((p) => !p.ejemplo && esCuentaDePrueba(p.cuenta)).map((p) => p.id));
  const ofertas = new Set(db.ofertas.filter((o) => pedidos.has(o.pedidoId) || prestadores.has(o.prestadorId)).map((o) => o.id));
  const cuentas = new Set((db.cuentas ?? []).filter((c) => esCuentaDePrueba(c.sub)).map((c) => c.sub));
  const fotos = [
    ...db.pedidos.filter((p) => pedidos.has(p.id) && p.fotoId).map((p) => p.fotoId as string),
    ...db.prestadores.filter((p) => prestadores.has(p.id)).flatMap((p) => p.fotos ?? []),
    ...db.ofertas.filter((o) => ofertas.has(o.id) && o.terminado?.fotoId).map((o) => o.terminado?.fotoId as string),
    ...(db.verificaciones ?? []).filter((v) => prestadores.has(v.prestadorId)).flatMap((v) => v.documentos),
    ...(db.reclamos ?? []).filter((r) => ofertas.has(r.ofertaId)).flatMap((r) => r.fotos),
  ];
  return { pedidos, prestadores, ofertas, cuentas, fotos };
}

export async function GET(request: Request) {
  const permiso = await comprobarAdmin(request);
  if (!permiso.ok) return permiso.respuesta;
  const seccion = new URL(request.url).searchParams.get("seccion") ?? "resumen";
  const db = await leer();

  if (seccion === "verificaciones") {
    const pendientes = (db.verificaciones ?? [])
      .filter((v) => v.estado === "pendiente")
      .map((v) => {
        const prestador = db.prestadores.find((p) => p.id === v.prestadorId);
        return { id: v.id, tipo: v.tipo, numero: v.numero ?? "", documentos: v.documentos, creado: v.creado, prestador: { nombre: prestador?.nombre ?? "", idPublico: prestador?.idPublico ?? "", rubros: prestador?.rubros ?? [] } };
      });
    return Response.json({ verificaciones: pendientes });
  }

  if (seccion === "denuncias") {
    const abiertas = (db.denuncias ?? [])
      .filter((d) => d.estado === "abierta")
      .map((d) => {
        const perfil = d.tipo === "perfil" ? db.prestadores.find((p) => p.idPublico === d.objetivo) : undefined;
        const mensaje = d.tipo === "mensaje" ? (db.mensajes ?? []).find((m) => m.id === d.objetivo) : undefined;
        const oferta = db.ofertas.find((o) => o.id === (d.ofertaId ?? mensaje?.ofertaId));
        const prestador = perfil ?? db.prestadores.find((p) => p.id === oferta?.prestadorId);
        const denunciasPrevias = (db.denuncias ?? []).filter((x) => x.objetivo === d.objetivo || (prestador && x.objetivo === prestador.idPublico)).length;
        return {
          id: d.id,
          tipo: d.tipo,
          motivo: d.motivo,
          detalle: d.detalle,
          creado: d.creado,
          denunciasPrevias,
          perfil: prestador ? { nombre: prestador.nombre, idPublico: prestador.idPublico, suspendido: Boolean(prestador.suspendido) } : null,
          mensaje: mensaje ? { de: mensaje.de, texto: mensaje.texto } : null,
          conversacion: conversacion(db, oferta?.id),
        };
      });
    return Response.json({ denuncias: abiertas });
  }

  if (seccion === "reclamos") {
    const abiertos = (db.reclamos ?? [])
      .filter((r) => r.estado === "abierto")
      .map((r) => {
        const pedido = db.pedidos.find((p) => p.id === r.pedidoId);
        const oferta = db.ofertas.find((o) => o.id === r.ofertaId);
        const prestador = db.prestadores.find((p) => p.id === oferta?.prestadorId);
        const pago = oferta ? pagoDe(db, oferta.id) : undefined;
        return {
          id: r.id,
          de: r.de,
          motivo: r.motivo,
          detalle: r.detalle,
          fotos: r.fotos,
          creado: r.creado,
          trabajo: { titulo: pedido?.titulo ?? "", precio: oferta?.precio ?? 0, cuando: oferta?.cuando ?? "", terminado: Boolean(oferta?.terminado), fotoDespues: oferta?.terminado?.fotoId ?? null, confirmado: Boolean(pedido?.confirmado) },
          vecino: pedido?.clienteNombre.split(" ")[0] ?? "",
          prestador: { nombre: prestador?.nombre ?? "", idPublico: prestador?.idPublico ?? "" },
          pago: pago ? { estado: pago.estado, monto: pago.monto, moneda: pago.moneda, proveedor: pago.proveedor, modo: pago.modo } : null,
          conversacion: conversacion(db, oferta?.id),
        };
      });
    return Response.json({ reclamos: abiertos });
  }

  if (seccion === "metricas") return Response.json({ metricas: metricas(db) });

  // Pedidos de eliminar cuenta hechos desde la página pública, sin entrar a la app.
  if (seccion === "bajas") {
    const pendientes = (db.bajas ?? [])
      .filter((b) => b.estado === "pendiente")
      .map((b) => ({ id: b.id, email: b.email, creado: b.creado, tieneCuenta: Boolean(db.cuentas?.some((c) => c.sub === `mail:${b.email}`)) }));
    return Response.json({ bajas: pendientes });
  }

  if (seccion === "pruebas") {
    const prueba = deLasPruebas(db);
    return Response.json({ pruebas: { cuentas: prueba.cuentas.size, pedidos: prueba.pedidos.size, prestadores: prueba.prestadores.size, presupuestos: prueba.ofertas.size, fotos: prueba.fotos.length } });
  }

  return Response.json({
    resumen: {
      bajas: (db.bajas ?? []).filter((b) => b.estado === "pendiente").length,
      verificaciones: (db.verificaciones ?? []).filter((v) => v.estado === "pendiente").length,
      denuncias: (db.denuncias ?? []).filter((d) => d.estado === "abierta").length,
      reclamos: (db.reclamos ?? []).filter((r) => r.estado === "abierto").length,
    },
  });
}

export async function POST(request: Request) {
  const permiso = await comprobarAdmin(request);
  if (!permiso.ok) return permiso.respuesta;
  const cuerpo = await request.json().catch(() => null);
  const accion = String(cuerpo?.accion ?? "");
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const ahora = new Date().toISOString();

  if (accion === "verificacion") {
    const aprobar = cuerpo?.aprobar === true;
    const motivo = limpiarTexto(cuerpo?.motivo, 200);
    if (!aprobar && !motivo) return Response.json({ error: "Al rechazar, escribí el motivo: lo ve el prestador." }, { status: 400 });
    const hecho = await modificar((db) => {
      const tramite = (db.verificaciones ?? []).find((v) => v.id === id && v.estado === "pendiente");
      if (!tramite) return false;
      tramite.estado = aprobar ? "aprobada" : "rechazada";
      tramite.motivo = aprobar ? undefined : motivo;
      tramite.revisado = ahora;
      const prestador = db.prestadores.find((p) => p.id === tramite.prestadorId);
      if (prestador) prestador.nivel = nivelDe(db, prestador.id);
      return true;
    });
    return hecho ? Response.json({ listo: true }) : Response.json({ error: "Ese trámite ya no está pendiente." }, { status: 404 });
  }

  if (accion === "denuncia") {
    const estado = cuerpo?.estado === "descartada" ? "descartada" : "resuelta";
    const hecho = await modificar((db) => {
      const denuncia = (db.denuncias ?? []).find((d) => d.id === id && d.estado === "abierta");
      if (!denuncia) return false;
      denuncia.estado = estado;
      denuncia.resuelta = ahora;
      return true;
    });
    return hecho ? Response.json({ listo: true }) : Response.json({ error: "Esa denuncia ya no está abierta." }, { status: 404 });
  }

  if (accion === "suspender") {
    const idPublico = typeof cuerpo?.idPublico === "string" ? cuerpo.idPublico : "";
    const suspendido = cuerpo?.suspendido === true;
    const hecho = await modificar((db) => {
      const prestador = db.prestadores.find((p) => p.idPublico === idPublico && !p.ejemplo);
      if (!prestador) return false;
      prestador.suspendido = suspendido || undefined;
      return true;
    });
    return hecho ? Response.json({ listo: true }) : Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
  }

  if (accion === "reclamo") {
    const resolucion = limpiarTexto(cuerpo?.resolucion, 400);
    if (!resolucion) return Response.json({ error: "Escribí cómo se resolvió: lo ven las dos partes." }, { status: 400 });
    const hecho = await modificar((db) => {
      const reclamo = (db.reclamos ?? []).find((r) => r.id === id && r.estado === "abierto");
      if (!reclamo) return false;
      reclamo.estado = "resuelto";
      reclamo.resolucion = resolucion;
      reclamo.resuelto = ahora;
      return true;
    });
    return hecho ? Response.json({ listo: true }) : Response.json({ error: "Ese reclamo ya no está abierto." }, { status: 404 });
  }

  // Resolver un pedido de baja de la página pública: se elimina la cuenta de ese mail (si existe).
  if (accion === "baja") {
    const resultado = await modificar((db) => {
      const baja = (db.bajas ?? []).find((b) => b.id === id && b.estado === "pendiente");
      if (!baja) return null;
      const r = eliminarCuenta(db, `mail:${baja.email}`);
      baja.estado = r.existia ? "hecha" : "sin-cuenta";
      baja.resuelta = ahora;
      return r;
    });
    if (!resultado) return Response.json({ error: "Ese pedido ya no está pendiente." }, { status: 404 });
    await borrarFotos(resultado.fotos);
    return Response.json({ eliminada: resultado.existia, borrados: resultado.borrados, anonimizados: resultado.anonimizados, plazos: PLAZOS });
  }

  // Cuentas para la revisión de Google Play (vecino y prestador verificado, con un pedido y un presupuesto de ejemplo).
  if (accion === "preparar-revision") {
    const datos = cuerpo?.datos;
    const valido = (c: unknown) => {
      const x = c as { email?: unknown; contrasena?: unknown } | null;
      return typeof x?.email === "string" && /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(x.email) && typeof x?.contrasena === "string" && x.contrasena.length >= 8;
    };
    if (!valido(datos?.vecino) || !valido(datos?.prestador)) return Response.json({ error: "Faltan mail y contraseña (8 o más) de las dos cuentas." }, { status: 400 });
    const huellas = await huellasDeRevision({
      vecino: { email: datos.vecino.email.toLowerCase(), contrasena: datos.vecino.contrasena },
      prestador: { email: datos.prestador.email.toLowerCase(), contrasena: datos.prestador.contrasena },
    });
    const listo = await modificar((db) => prepararRevision(db, huellas));
    return Response.json({ listo });
  }

  // Borra SOLO lo que crearon las cuentas de las pruebas automáticas (mails .test). Nunca toca datos reales.
  if (accion === "limpiar-pruebas") {
    if (cuerpo?.confirmar !== true) return Response.json({ error: "Falta confirmar." }, { status: 400 });
    const resultado = await modificar((db) => {
      const prueba = deLasPruebas(db);
      const antes = { pedidos: db.pedidos.length, prestadores: db.prestadores.length, ofertas: db.ofertas.length, cuentas: (db.cuentas ?? []).length };
      db.pedidos = db.pedidos.filter((p) => !prueba.pedidos.has(p.id));
      db.prestadores = db.prestadores.filter((p) => !prueba.prestadores.has(p.id));
      db.ofertas = db.ofertas.filter((o) => !prueba.ofertas.has(o.id));
      db.mensajes = (db.mensajes ?? []).filter((m) => !prueba.ofertas.has(m.ofertaId));
      db.pagos = (db.pagos ?? []).filter((p) => !prueba.ofertas.has(p.ofertaId));
      db.reclamos = (db.reclamos ?? []).filter((r) => !prueba.ofertas.has(r.ofertaId));
      db.verificaciones = (db.verificaciones ?? []).filter((v) => !prueba.prestadores.has(v.prestadorId));
      db.denuncias = (db.denuncias ?? []).filter((d) => !prueba.cuentas.has(d.cuenta));
      db.suscripciones = (db.suscripciones ?? []).filter((s) => !prueba.cuentas.has(s.cuenta));
      db.avisos = (db.avisos ?? []).filter((a) => !prueba.cuentas.has(a.cuenta));
      db.cuentas = (db.cuentas ?? []).filter((c) => !prueba.cuentas.has(c.sub));
      return {
        borrados: {
          pedidos: antes.pedidos - db.pedidos.length,
          prestadores: antes.prestadores - db.prestadores.length,
          presupuestos: antes.ofertas - db.ofertas.length,
          cuentas: antes.cuentas - db.cuentas.length,
        },
        fotos: prueba.fotos,
      };
    });
    await borrarFotos(resultado.fotos);
    return Response.json({ borrados: { ...resultado.borrados, fotos: resultado.fotos.length } });
  }

  return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
