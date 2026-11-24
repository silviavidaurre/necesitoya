import { PLAZOS, eliminarCuenta } from "@/lib/bajas";
import { correoDisponible, enlaceValido, enviarCorreo, huellaDeEnlace, nuevoEnlace } from "@/lib/correo";
import { borrarFotos, conexionDe, dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { limpiarTexto } from "@/lib/texto";

// Pedido de eliminar una cuenta SIN entrar a la app (página pública /eliminar-cuenta, como pide Google Play).
// Sin correo configurado se registra para que el equipo lo resuelva en /admin.
// Con correo, además le llega al mail un enlace para confirmar: al abrirlo, la cuenta se elimina en el momento.
// La respuesta es siempre la misma, exista o no la cuenta: así nadie puede averiguar si un mail está registrado.
const MAIL_VALIDO = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const VENCE_HORAS = 24;

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);

  // Confirmación con el enlace del mail: se elimina la cuenta.
  if (cuerpo?.confirmar !== undefined) {
    if (!enlaceValido(cuerpo.confirmar)) return Response.json({ error: "El enlace no es válido." }, { status: 400 });
    const buscada = await huellaDeEnlace(cuerpo.confirmar);
    const ahora = new Date().toISOString();
    const resultado = await modificar((db) => {
      const baja = (db.bajas ?? []).find((b) => b.estado === "pendiente" && b.confirmacion?.huella === buscada && b.confirmacion.vence >= ahora);
      if (!baja) return null;
      const r = eliminarCuenta(db, `mail:${baja.email}`);
      baja.estado = r.existia ? "hecha" : "sin-cuenta";
      baja.resuelta = ahora;
      baja.confirmacion = undefined;
      return r;
    });
    if (!resultado) return Response.json({ error: "El enlace venció o ya se usó. Pedí otro desde esta página." }, { status: 400 });
    await borrarFotos(resultado.fotos).catch((error) => console.error("[baja] fotos", error));
    return Response.json({ eliminada: true, plazos: PLAZOS });
  }

  const email = limpiarTexto(cuerpo?.email, 120).toLowerCase();
  if (!MAIL_VALIDO.test(email)) return Response.json({ error: "Escribí el mail de tu cuenta." }, { status: 400 });
  if (!(await dentroDelCupo("bajas")) || !(await dentroDelCupoDe("bajasPorConexion", conexionDe(request)))) {
    return Response.json({ error: "Hubo demasiados pedidos. Probá de nuevo mañana o escribinos." }, { status: 429 });
  }
  const porMail = correoDisponible();
  const conCuenta = porMail && Boolean((await leer()).cuentas?.some((c) => c.sub === `mail:${email}` && !c.demo));
  const enlace = conCuenta ? nuevoEnlace(VENCE_HORAS * 60) : null;
  const confirmacion = enlace ? { huella: await huellaDeEnlace(enlace.token), vence: enlace.vence } : undefined;
  await modificar((db) => {
    const ya = (db.bajas ?? []).find((b) => b.email === email && b.estado === "pendiente");
    if (ya) {
      // Un pedido nuevo reemplaza el enlace anterior.
      if (confirmacion) ya.confirmacion = confirmacion;
      return;
    }
    db.bajas = [...(db.bajas ?? []), { id: nuevoId(), email, estado: "pendiente", creado: new Date().toISOString(), ...(confirmacion ? { confirmacion } : {}) }];
  });
  if (enlace) {
    await enviarCorreo({
      para: email,
      asunto: "Confirmá que querés eliminar tu cuenta de NecesitoYa",
      texto: [
        "Hola.",
        "",
        "Pidieron eliminar la cuenta de NecesitoYa de este mail. Si fuiste vos, abrí este enlace y confirmá:",
        `${new URL(request.url).origin}/eliminar-cuenta?confirmar=${enlace.token}`,
        "",
        `Vence en ${VENCE_HORAS} horas. Si no lo pediste, ignorá este mail: tu cuenta sigue igual.`,
        "",
        "NecesitoYa",
      ].join("\n"),
    });
  }
  return Response.json(
    { recibido: true, porMail, plazo: porMail ? "Si el mail tiene cuenta, te llega un enlace para confirmar." : "Lo resolvemos en hasta 7 días hábiles." },
    { status: 201 },
  );
}
