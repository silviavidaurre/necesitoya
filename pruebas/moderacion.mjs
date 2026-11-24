// Prueba lo que hace confiable al producto: verificación de DNI y matrícula, reclamos, cambiar el día, cancelar,
// denuncias, bloqueos, panel de moderación, límites por persona y métricas sin datos de prueba.
// Uso: node pruebas/moderacion.mjs [url]
// El panel se prueba con ADMIN_SECRET del entorno o de .env.local (nunca se imprime).
import { DIRECCION, cuentaDePrueba, png, secretoLocal, turnoPara } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
const ADMIN = secretoLocal("ADMIN_SECRET");
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const j = async (ruta, cuerpo, encabezados = {}) => {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(U + ruta, {
        method: cuerpo ? "POST" : "GET",
        headers: { "content-type": "application/json", ...encabezados },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      return { estado: r.status, datos: await r.json().catch(() => null), r };
    } catch (error) {
      if (intento >= 3) throw error;
    }
  }
};
const admin = (ruta, cuerpo) => j(ruta, cuerpo, { "x-admin": ADMIN });
const foto = (gris) => ({ tipo: "image/png", base64: png(gris) });

const metricasAntes = ADMIN ? (await admin("/api/admin?seccion=metricas")).datos?.metricas : null;

// Un vecino, un prestador y un trabajo elegido.
const cuentaVecina = await cuentaDePrueba(U, "vecina");
const nuevoPedido = async (titulo) =>
  (await j("/api/pedidos", { titulo, descripcion: "Prueba de moderación", rubro: "plomeria", urgencia: "semana", zona: "Centro", precioMin: 20000, precioMax: 40000, clienteNombre: "Vecina Moderación", cuenta: cuentaVecina })).datos;
const pr = (await j("/api/prestadores", { nombre: "Plomero Moderación", rubros: ["plomeria"], zonas: ["Centro"], aniosExperiencia: 4, descripcion: "Prueba", cuenta: await cuentaDePrueba(U, "prestador") })).datos.prestador;
const pedido = await nuevoPedido("Prueba de moderación: cambiar el flexible");
const oferta = (await j("/api/ofertas", { pedidoId: pedido.id, prestadorId: pr.id, precio: 30000, cuando: "Mañana", mensaje: "" })).datos.oferta;
await j("/api/pedido/elegir", { id: pedido.id, clave: pedido.clave, ofertaId: oferta.id, direccion: DIRECCION, turno: turnoPara("Mañana") });
const vecino = { pedidoId: pedido.id, clave: pedido.clave };

// --- Verificación ---------------------------------------------------------------------------------
ok("el DNI con una sola foto se rechaza", (await j("/api/verificacion", { prestadorId: pr.id, tipo: "dni", documentos: [foto(10)] })).estado === 400);
const dni = await j("/api/verificacion", { prestadorId: pr.id, tipo: "dni", documentos: [foto(11), foto(12)] });
ok("manda el DNI y la selfie", dni.estado === 201, dni.datos?.error ?? "");
ok("no se manda dos veces mientras se revisa", (await j("/api/verificacion", { prestadorId: pr.id, tipo: "dni", documentos: [foto(13), foto(14)] })).estado === 409);
const estado = await j(`/api/verificacion?prestadorId=${pr.id}`);
ok("el prestador ve que está en revisión", estado.datos?.tramites?.[0]?.estado === "pendiente");
ok("otro no puede mandar por él", (await j("/api/verificacion", { prestadorId: "no-existe", tipo: "dni", documentos: [foto(15), foto(16)] })).estado === 404);
const matricula = await j("/api/verificacion", { prestadorId: pr.id, tipo: "matricula", numero: "MP-1234", documentos: [foto(17)] });
ok("manda la matrícula", matricula.estado === 201);

// --- Panel: sin clave no entra ---------------------------------------------------------------------
const sinClave = await j("/api/admin?seccion=resumen");
ok("el panel sin clave no entra", sinClave.estado === 401 || sinClave.estado === 503, `(${sinClave.estado})`);
ok("con una clave equivocada tampoco", (await j("/api/admin?seccion=resumen", undefined, { "x-admin": "clave-equivocada-123" })).estado !== 200);

if (ADMIN) {
  const pendientes = (await admin("/api/admin?seccion=verificaciones")).datos?.verificaciones ?? [];
  const tramiteDni = pendientes.find((v) => v.prestador.idPublico === pr.idPublico && v.tipo === "dni");
  const tramiteMat = pendientes.find((v) => v.prestador.idPublico === pr.idPublico && v.tipo === "matricula");
  ok("el panel lista los trámites con sus fotos", Boolean(tramiteDni) && tramiteDni.documentos.length === 2 && tramiteMat?.numero === "MP-1234");
  const documento = await fetch(`${U}/api/admin/documento?id=${tramiteDni?.documentos[0]}`, { headers: { "x-admin": ADMIN } });
  ok("el panel ve la foto del DNI", documento.status === 200 && (documento.headers.get("content-type") ?? "").startsWith("image/"));
  ok("la foto del DNI no se sirve por la ruta pública", (await fetch(`${U}/api/fotos?id=${tramiteDni?.documentos[0]}`)).status === 400);
  ok("ni el panel la sirve sin clave", (await fetch(`${U}/api/admin/documento?id=${tramiteDni?.documentos[0]}`)).status !== 200);
  ok("rechazar sin motivo no se puede", (await admin("/api/admin", { accion: "verificacion", id: tramiteMat?.id, aprobar: false })).estado === 400);
  // La matrícula aprobada sola no alcanza para "verificado": hace falta el DNI.
  await admin("/api/admin", { accion: "verificacion", id: tramiteMat?.id, aprobar: true });
  ok("con la matrícula sola sigue sin verificar", (await j(`/api/perfil?id=${pr.idPublico}`)).datos.perfil.nivel === 1);
  await admin("/api/admin", { accion: "verificacion", id: tramiteDni?.id, aprobar: true });
  ok("con DNI y matrícula aprobados queda verificado con matrícula", (await j(`/api/perfil?id=${pr.idPublico}`)).datos.perfil.nivel === 3);
  const enPresupuesto = (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`)).datos.ofertas[0].prestador.nivel;
  ok("el vecino lo ve verificado en el presupuesto", enPresupuesto === 3);
}

// --- Cambiar el día --------------------------------------------------------------------------------
ok("un extraño no cambia el día", (await j("/api/ofertas/dia", { ofertaId: oferta.id, pedidoId: pedido.id, clave: "otra", cuando: "Hoy" })).estado === 403);
const dia = await j("/api/ofertas/dia", { ofertaId: oferta.id, ...vecino, cuando: "El sábado a la mañana" });
ok("el vecino cambia el día", dia.estado === 200 && dia.datos.cuando === "El sábado a la mañana");
const chat = await j(`/api/chat?ofertaId=${oferta.id}&prestadorId=${pr.id}`);
ok("queda escrito en el chat", chat.datos?.mensajes?.some((m) => m.texto.includes("sábado")));
ok("el prestador también lo puede cambiar", (await j("/api/ofertas/dia", { ofertaId: oferta.id, prestadorId: pr.id, cuando: "Hoy" })).estado === 200);

// --- Reclamo ---------------------------------------------------------------------------------------
ok("un reclamo sin motivo se rechaza", (await j("/api/reclamos", { ofertaId: oferta.id, ...vecino, detalle: "No vino en todo el día" })).estado === 400);
const reclamo = await j("/api/reclamos", { ofertaId: oferta.id, ...vecino, motivo: "No vino", detalle: "Quedamos el sábado y no vino ni avisó.", fotos: [foto(40)] });
ok("el vecino reclama con una foto", reclamo.estado === 201 && reclamo.datos.reclamo.estado === "abierto", reclamo.datos?.error ?? "");
ok("sin pago protegido no pide abrir la disputa", reclamo.datos?.disputa === null);
ok("no reclama dos veces lo mismo", (await j("/api/reclamos", { ofertaId: oferta.id, ...vecino, motivo: "No vino", detalle: "Otra vez lo mismo, no vino." })).estado === 409);
ok("el vecino ve su reclamo en el pedido", (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`)).datos.reclamos?.[0]?.estado === "abierto");
ok("el prestador ve que hay un reclamo", (await j(`/api/ofertas?prestadorId=${pr.id}`)).datos.ofertas[0].reclamos?.length === 1);
if (ADMIN) {
  const abiertos = (await admin("/api/admin?seccion=reclamos")).datos?.reclamos ?? [];
  const delTrabajo = abiertos.find((r) => r.trabajo.titulo.includes("cambiar el flexible"));
  ok("el panel lo ve con la foto y el chat como prueba", Boolean(delTrabajo) && delTrabajo.fotos.length === 1 && delTrabajo.conversacion.length >= 2);
  await admin("/api/admin", { accion: "reclamo", id: delTrabajo?.id, resolucion: "Hablamos con los dos y reprogramaron." });
  ok("el reclamo resuelto se ve en el pedido", (await j(`/api/pedido?id=${pedido.id}&clave=${pedido.clave}`)).datos.reclamos?.[0]?.estado === "resuelto");
}

// --- Cancelar --------------------------------------------------------------------------------------
const otro = await nuevoPedido("Prueba de moderación: pedido para cancelar");
ok("otro no puede cancelarlo", (await j("/api/pedido/cancelar", { id: otro.id, clave: "otra" })).estado === 403);
const cancelado = await j("/api/pedido/cancelar", { id: otro.id, clave: otro.clave, motivo: "Ya lo resolví" });
ok("el vecino cancela su pedido", cancelado.estado === 200 && cancelado.datos.pedido.estado === "cancelado");
ok("los prestadores dejan de verlo", !(await j(`/api/pedidos?prestadorId=${pr.id}`)).datos.pedidos.some((p) => p.id === otro.id));
ok("y no se puede presupuestar", (await j("/api/ofertas", { pedidoId: otro.id, prestadorId: pr.id, precio: 25000, cuando: "Hoy" })).estado === 404);

// --- Denuncias y bloqueos --------------------------------------------------------------------------
ok("denunciar sin cuenta no se puede", (await j("/api/denuncias", { tipo: "perfil", objetivo: pr.idPublico, motivo: "Perfil falso" })).estado === 401);
ok("denunciar con un motivo inventado no se puede", (await j("/api/denuncias", { tipo: "perfil", objetivo: pr.idPublico, motivo: "cualquier cosa", cuenta: cuentaVecina })).estado === 400);
ok("el vecino denuncia el perfil", (await j("/api/denuncias", { tipo: "perfil", objetivo: pr.idPublico, motivo: "Perfil falso", detalle: "Prueba", cuenta: cuentaVecina })).estado === 201);
const ultimo = chat.datos.mensajes[chat.datos.mensajes.length - 1];
const ajena = await cuentaDePrueba(U, "ajena");
ok("alguien de afuera no denuncia un mensaje ajeno", (await j("/api/denuncias", { tipo: "mensaje", objetivo: ultimo.id, motivo: "Insultos o acoso", cuenta: ajena })).estado === 403);
ok("el vecino denuncia un mensaje de su chat", (await j("/api/denuncias", { tipo: "mensaje", objetivo: ultimo.id, motivo: "Insultos o acoso", cuenta: cuentaVecina })).estado === 201);
if (ADMIN) {
  const denuncias = (await admin("/api/admin?seccion=denuncias")).datos?.denuncias ?? [];
  const delPerfil = denuncias.find((d) => d.perfil?.idPublico === pr.idPublico && d.tipo === "perfil");
  ok("el panel ve las denuncias con el chat", Boolean(delPerfil) && denuncias.some((d) => d.tipo === "mensaje" && d.conversacion.length > 0));
  await admin("/api/admin", { accion: "suspender", idPublico: pr.idPublico, suspendido: true });
  const nuevo = await nuevoPedido("Prueba de moderación: pedido con prestador suspendido");
  ok("un perfil suspendido no puede presupuestar", (await j("/api/ofertas", { pedidoId: nuevo.id, prestadorId: pr.id, precio: 25000, cuando: "Hoy" })).estado === 403);
  await admin("/api/admin", { accion: "suspender", idPublico: pr.idPublico, suspendido: false });
  await admin("/api/admin", { accion: "denuncia", id: delPerfil?.id, estado: "descartada" });
}
const paraBloquear = await nuevoPedido("Prueba de moderación: pedido antes del bloqueo");
ok("antes del bloqueo el prestador ve el pedido", (await j(`/api/pedidos?prestadorId=${pr.id}`)).datos.pedidos.some((p) => p.id === paraBloquear.id));
ok("un extraño no bloquea por otro", (await j("/api/bloqueos", { ofertaId: oferta.id, pedidoId: pedido.id, clave: "otra" })).estado === 403);
ok("el vecino bloquea al prestador desde el chat", (await j("/api/bloqueos", { ofertaId: oferta.id, ...vecino })).estado === 200);
ok("el prestador ya no ve los pedidos del vecino", !(await j(`/api/pedidos?prestadorId=${pr.id}`)).datos.pedidos.some((p) => p.id === paraBloquear.id));
ok("ni puede presupuestarlos", (await j("/api/ofertas", { pedidoId: paraBloquear.id, prestadorId: pr.id, precio: 25000, cuando: "Hoy" })).estado === 404);
ok("el chat queda cerrado", (await j(`/api/chat?ofertaId=${oferta.id}&prestadorId=${pr.id}`)).datos.motivo === "bloqueado");
ok("y no se puede escribir", (await j("/api/chat", { ofertaId: oferta.id, prestadorId: pr.id, texto: "Hola?" })).estado === 409);
ok("el bloqueo se puede deshacer", (await j("/api/bloqueos", { ofertaId: oferta.id, ...vecino, deshacer: true })).estado === 200);

// --- Métricas ---------------------------------------------------------------------------------------
if (ADMIN) {
  const metricasDespues = (await admin("/api/admin?seccion=metricas")).datos?.metricas;
  ok("el panel da las métricas", typeof metricasDespues?.pedidos === "number" && "conPresupuestoEnMenosDeUnaHora" in metricasDespues && Array.isArray(metricasDespues.semanas));
  ok("lo de las pruebas no cuenta en las métricas", metricasDespues?.pedidos === metricasAntes?.pedidos && metricasDespues?.elegidos.cantidad === metricasAntes?.elegidos.cantidad, `${metricasAntes?.pedidos} -> ${metricasDespues?.pedidos}`);
  const pruebas = (await admin("/api/admin?seccion=pruebas")).datos?.pruebas;
  ok("el panel cuenta lo que crearon las pruebas", pruebas?.pedidos > 0 && pruebas?.cuentas > 0);
}

// --- Límites por persona (solo en local: en producción gastaría el cupo del día) ---------------------
if (/localhost|127[.]0[.]0[.]1/.test(U)) {
  const apurada = await cuentaDePrueba(U, "apurada");
  let ultimoEstado = 0;
  for (let i = 0; i < 16; i++) {
    ultimoEstado = (await j("/api/pedidos", { titulo: `Prueba de límite ${i}`, rubro: "otros", zona: "Centro", clienteNombre: "Apurada", cuenta: apurada })).estado;
  }
  ok("una sola cuenta no puede publicar más de 15 pedidos por día", ultimoEstado === 429, `(${ultimoEstado})`);
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
