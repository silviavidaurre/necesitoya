// Prueba eliminar la cuenta (Google Play y Ley 25.326): desde la app, desde la página pública con el panel,
// qué se borra y qué se guarda anonimizado, y que después ese mail no recupera nada. También las cuentas de revisión.
// Uso: node pruebas/eliminar.mjs [url]   (el panel se prueba con ADMIN_SECRET de .env.local)
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
      const r = await fetch(U + ruta, { method: cuerpo ? "POST" : "GET", headers: { "content-type": "application/json", ...encabezados }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      return { estado: r.status, datos: await r.json().catch(() => null) };
    } catch (error) {
      if (intento >= 3) throw error;
    }
  }
};
const admin = (ruta, cuerpo) => j(ruta, cuerpo, { "x-admin": ADMIN });
const foto = (gris) => ({ tipo: "image/png", base64: png(gris) });
const estadoDeFoto = async (id) => (await fetch(`${U}/api/fotos?id=${id}`)).status;

// Cuentas con mail y contraseña conocidos, para poder volver a entrar después de eliminarlas.
const marca = crypto.randomUUID().slice(0, 10);
const mailVecino = `baja-vecino-${marca}@necesitoya.test`;
const claveVecino = crypto.randomUUID();
const mailPrestador = `baja-prestador-${marca}@necesitoya.test`;
const clavePrestador = crypto.randomUUID();
const vecino = (await j("/api/cuenta", { email: mailVecino, contrasena: claveVecino })).datos.clave;
const cuentaPrestador = (await j("/api/cuenta", { email: mailPrestador, contrasena: clavePrestador })).datos.clave;

// Lo que tiene el prestador: perfil con foto, billetera y verificación.
const pr = (await j("/api/prestadores", { nombre: "Prestador Baja", rubros: ["plomeria"], zonas: ["Centro"], cuenta: cuentaPrestador })).datos.prestador;
const fotoPerfil = (await j("/api/prestadores/fotos", { id: pr.id, foto: foto(30) })).datos.fotos[0];
await j("/api/verificacion", { prestadorId: pr.id, tipo: "dni", documentos: [foto(31), foto(32)] });

// Lo que tiene el vecino: un pedido abierto con foto, y un trabajo elegido con chat y un reclamo abierto.
const pedido = (body) => j("/api/pedidos", { descripcion: "Prueba de baja", rubro: "plomeria", urgencia: "semana", zona: "Centro", clienteNombre: "Vecina Baja", cuenta: vecino, ...body });
const abierto = (await pedido({ titulo: "Prueba de baja: pedido abierto", foto: foto(40) })).datos;
const fotoDelPedido = (await j(`/api/pedidos?prestadorId=${pr.id}`)).datos.pedidos.find((p) => p.id === abierto.id)?.fotoId;
const conReclamo = (await pedido({ titulo: "Prueba de baja: trabajo con reclamo" })).datos;
const oferta = (await j("/api/ofertas", { pedidoId: conReclamo.id, prestadorId: pr.id, precio: 30000, cuando: "Hoy" })).datos.oferta;
await j("/api/pedido/elegir", { id: conReclamo.id, clave: conReclamo.clave, ofertaId: oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });
await j("/api/chat", { ofertaId: oferta.id, pedidoId: conReclamo.id, clave: conReclamo.clave, texto: "Hola, ¿venís hoy?" });
await j("/api/reclamos", { ofertaId: oferta.id, pedidoId: conReclamo.id, clave: conReclamo.clave, motivo: "No vino", detalle: "Quedamos hoy y no vino." });
const avisos = (await j("/api/avisos")).datos;
const endpoint = `https://fcm.googleapis.com/fcm/send/baja-${crypto.randomUUID()}`;
if (avisos?.disponible) await j("/api/avisos", { cuenta: vecino, suscripcion: { endpoint } });

// --- Eliminar desde la app: el vecino --------------------------------------------------------------
ok("sin confirmar no se elimina", (await j("/api/cuenta/eliminar", { cuenta: vecino })).estado === 400);
ok("con una llave inventada no se elimina", (await j("/api/cuenta/eliminar", { cuenta: crypto.randomUUID(), confirmar: true })).estado === 401);
const baja = await j("/api/cuenta/eliminar", { cuenta: vecino, confirmar: true });
ok("el vecino elimina su cuenta", baja.estado === 200 && baja.datos.eliminada === true, JSON.stringify(baja.datos?.borrados ?? baja.datos));
ok("dice qué guarda y por cuánto tiempo", baja.datos?.plazos?.pagos === "10 años" && Boolean(baja.datos?.plazos?.reclamos));
ok("el pedido abierto se borró", (await j(`/api/pedido?id=${abierto.id}&clave=${abierto.clave}`)).estado === 404);
ok("y su foto también", (await estadoDeFoto(fotoDelPedido)) === 404);
ok("el trabajo con reclamo abierto se guarda pero sin la clave del vecino", (await j(`/api/pedido?id=${conReclamo.id}&clave=${conReclamo.clave}`)).estado === 403);
const chat = await j(`/api/chat?ofertaId=${oferta.id}&prestadorId=${pr.id}`);
ok("los mensajes de esa conversación se borraron", chat.estado === 200 && chat.datos.mensajes.length === 0);
const vistaDelPrestador = (await j(`/api/ofertas?prestadorId=${pr.id}`)).datos.ofertas.find((o) => o.id === oferta.id);
ok("el prestador ya no ve el nombre ni la dirección del vecino", vistaDelPrestador?.cliente?.nombre === "Usuario" && vistaDelPrestador.direccion === null && !JSON.stringify(vistaDelPrestador).includes(DIRECCION.calle));
if (ADMIN) {
  const reclamo = (await admin("/api/admin?seccion=reclamos")).datos.reclamos.find((r) => r.trabajo.titulo === "Trabajo de una cuenta eliminada" && r.prestador.idPublico === pr.idPublico);
  ok("el reclamo abierto queda para resolverlo, sin datos del vecino", Boolean(reclamo) && reclamo.vecino === "Usuario" && reclamo.conversacion.length === 0);
}
if (avisos?.disponible) ok("los avisos de la cuenta se borraron", (await j("/api/avisos/ultimo", { endpoint })).datos?.aviso === null);
ok("la llave vieja ya no sirve para pedir", (await pedido({ titulo: "Prueba de baja: con la llave vieja" })).estado === 401);
const deNuevo = await j("/api/cuenta", { email: mailVecino, contrasena: claveVecino });
ok("con ese mail ya no se entra a la cuenta borrada: queda una cuenta nueva y vacía", deNuevo.estado === 200 && deNuevo.datos.nueva === true && deNuevo.datos.pedidos.length === 0 && deNuevo.datos.clave !== vecino);

// --- Eliminar desde la app: el prestador -----------------------------------------------------------
const bajaPrestador = await j("/api/cuenta/eliminar", { cuenta: cuentaPrestador, confirmar: true });
ok("el prestador elimina su cuenta", bajaPrestador.estado === 200 && bajaPrestador.datos.borrados.perfiles === 1);
ok("su perfil público ya no existe", (await j(`/api/perfil?id=${pr.idPublico}`)).estado === 404);
ok("ni su perfil privado (con la billetera)", (await j(`/api/prestadores?id=${pr.id}`)).estado === 404);
ok("la foto de su trabajo se borró", (await estadoDeFoto(fotoPerfil)) === 404);
const otraVez = await j("/api/cuenta", { email: mailPrestador, contrasena: clavePrestador });
ok("con su mail tampoco recupera el perfil", otraVez.datos?.nueva === true && otraVez.datos.prestadorId === null);

// --- Página pública y panel ------------------------------------------------------------------------
ok("la página pública rechaza un mail mal escrito", (await j("/api/eliminar-cuenta", { email: "no-es-un-mail" })).estado === 400);
const mailPublico = `baja-publica-${marca}@necesitoya.test`;
await j("/api/cuenta", { email: mailPublico, contrasena: crypto.randomUUID() });
const pedidoPublico = await j("/api/eliminar-cuenta", { email: mailPublico });
ok("pedir la baja sin entrar queda registrado", pedidoPublico.estado === 201 && pedidoPublico.datos.recibido === true);
const sinCuenta = await j("/api/eliminar-cuenta", { email: `nadie-${marca}@necesitoya.test` });
ok("la respuesta es la misma aunque el mail no tenga cuenta", sinCuenta.estado === 201 && JSON.stringify(sinCuenta.datos) === JSON.stringify(pedidoPublico.datos));
if (ADMIN) {
  const pendientes = (await admin("/api/admin?seccion=bajas")).datos.bajas;
  const delMail = pendientes.find((b) => b.email === mailPublico);
  ok("el panel ve el pedido de baja", Boolean(delMail) && delMail.tieneCuenta === true);
  const resuelta = await admin("/api/admin", { accion: "baja", id: delMail?.id });
  ok("el panel elimina esa cuenta", resuelta.estado === 200 && resuelta.datos.eliminada === true);
  ok("el pedido ya no está pendiente", !(await admin("/api/admin?seccion=bajas")).datos.bajas.some((b) => b.email === mailPublico));
  const sinDuenio = (await admin("/api/admin?seccion=bajas")).datos.bajas.find((b) => b.email === `nadie-${marca}@necesitoya.test`);
  ok("un pedido de un mail sin cuenta se marca resuelto", (await admin("/api/admin", { accion: "baja", id: sinDuenio?.id })).datos?.eliminada === false);

  // --- Cuentas para la revisión de Google Play -----------------------------------------------------
  const antes = (await admin("/api/admin?seccion=metricas")).datos.metricas;
  const revision = {
    vecino: { email: `revision-vecino-${marca}@necesitoya.test`, contrasena: crypto.randomUUID() },
    prestador: { email: `revision-prestador-${marca}@necesitoya.test`, contrasena: crypto.randomUUID() },
  };
  ok("el panel prepara las cuentas de revisión", (await admin("/api/admin", { accion: "preparar-revision", datos: revision })).estado === 200);
  const entraVecino = (await j("/api/cuenta", revision.vecino)).datos;
  ok("la cuenta de vecino entra y tiene un pedido de ejemplo", entraVecino.nueva === false && entraVecino.pedidos.length === 1);
  const seguimiento = (await j(`/api/pedido?id=${entraVecino.pedidos[0].id}&clave=${entraVecino.pedidos[0].clave}`)).datos;
  ok("el pedido y el presupuesto están marcados de ejemplo", seguimiento.pedido.ejemplo === true && seguimiento.ofertas.length === 1 && seguimiento.ofertas[0].ejemplo === true);
  const entraPrestador = (await j("/api/cuenta", revision.prestador)).datos;
  const perfil = (await j(`/api/prestadores?id=${entraPrestador.prestadorId}`)).datos.prestador;
  ok("la cuenta de prestador entra y está verificada con matrícula", perfil?.nivel === 3 && perfil.conCuenta === true);
  const despues = (await admin("/api/admin?seccion=metricas")).datos.metricas;
  ok("las cuentas de revisión no cuentan en las métricas", despues.pedidos === antes.pedidos && despues.prestadores === antes.prestadores);
  ok("prepararlas de nuevo deja todo como nuevo", (await admin("/api/admin", { accion: "preparar-revision", datos: revision })).estado === 200 && (await j("/api/cuenta", revision.vecino)).datos.pedidos.length === 1);
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
