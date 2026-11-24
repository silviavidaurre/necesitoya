// Prueba lo que usa el mail: crear cuenta y entrar, recuperar la contraseña con un enlace y el pedido de baja
// por mail (página pública /eliminar-cuenta).
// Uso: node pruebas/correo.mjs [url]
// Sin correo configurado (RESEND_API_KEY y MAIL_REMITENTE) prueba que todo siga andando sin mandar nada.
// Con correo, los mails van a direcciones .test: nunca se mandan, quedan en la bandeja de prueba que se lee
// desde el panel interno (hace falta ADMIN_SECRET en el entorno o en .env.local). Nada de esto se imprime.
import { secretoLocal } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
const ADMIN = secretoLocal("ADMIN_SECRET");
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const j = async (ruta, cuerpo, cabeceras = {}) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json", ...cabeceras }, body: JSON.stringify(cuerpo) } : { headers: cabeceras });
  return { estado: r.status, datos: await r.json().catch(() => null) };
};
const marca = crypto.randomUUID().slice(0, 10);
const mail = `correo-${marca}@necesitoya.test`;
const contrasena = crypto.randomUUID();

// --- Cuenta con mail ------------------------------------------------------------------------------
const alta = await j("/api/cuenta", { email: mail, contrasena });
ok("se crea la cuenta con mail y contraseña", alta.estado === 200 && typeof alta.datos?.clave === "string" && alta.datos.nueva === true, `(${alta.estado})`);
const otraVez = await j("/api/cuenta", { email: mail.toUpperCase(), contrasena });
ok("se entra con el mismo mail (sin importar mayúsculas)", otraVez.estado === 200 && otraVez.datos?.clave === alta.datos?.clave && otraVez.datos.nueva === false);
ok("con otra contraseña no entra", (await j("/api/cuenta", { email: mail, contrasena: "otra-contrasena" })).estado === 401);
ok("un mail mal escrito se rechaza", (await j("/api/cuenta", { email: "sin-arroba", contrasena })).estado === 400);

const config = await j("/api/cuenta");
ok("el servidor dice si se puede recuperar la contraseña", config.estado === 200 && typeof config.datos?.recuperar === "boolean", config.datos?.recuperar ? "(con correo)" : "(sin correo)");

if (!config.datos?.recuperar) {
  ok("sin correo, pedir otra contraseña responde que no está disponible", (await j("/api/cuenta/recuperar", { email: mail })).estado === 503);
  const baja = await j("/api/eliminar-cuenta", { email: `nadie-${marca}@necesitoya.test` });
  ok("sin correo, el pedido de baja queda para el equipo", baja.estado === 201 && baja.datos?.porMail === false);
} else if (!ADMIN) {
  console.log("Hay correo pero falta ADMIN_SECRET: no se puede leer la bandeja de prueba. Se saltea el resto.");
} else {
  const bandeja = async (para) => {
    for (let intento = 0; intento < 10; intento++) {
      const correos = (await j("/api/admin?seccion=correos", undefined, { "x-admin": ADMIN })).datos?.correos ?? [];
      const propios = correos.filter((c) => c.para === para);
      if (propios.length > 0) return propios;
      await new Promise((listo) => setTimeout(listo, 300));
    }
    return [];
  };
  const enlaceDe = (texto, ruta) => texto.match(new RegExp(`${ruta}[?](?:t|confirmar)=([A-Za-z0-9_-]+)`))?.[1] ?? "";

  // --- Recuperar la contraseña ---------------------------------------------------------------------
  const pedido = await j("/api/cuenta/recuperar", { email: mail });
  ok("pedir otra contraseña responde siempre lo mismo", pedido.estado === 200 && pedido.datos?.enviado === true);
  const inexistente = await j("/api/cuenta/recuperar", { email: `nadie-${marca}@necesitoya.test` });
  ok("con un mail sin cuenta responde igual (no se puede averiguar quién tiene cuenta)", inexistente.estado === 200 && JSON.stringify(inexistente.datos) === JSON.stringify(pedido.datos));
  ok("a un mail sin cuenta no se le manda nada", (await bandeja(`nadie-${marca}@necesitoya.test`)).length === 0);
  const [correo] = await bandeja(mail);
  const token = enlaceDe(correo?.texto ?? "", "/recuperar");
  ok("llega el mail con el enlace", Boolean(token) && /contraseña/i.test(correo?.asunto ?? ""));
  ok("el mail no trae la contraseña ni la clave de la cuenta", !correo?.texto.includes(contrasena) && !correo?.texto.includes(alta.datos?.clave));
  ok("un enlace inventado no sirve", (await j("/api/cuenta/recuperar", { token: "x".repeat(43), contrasena: "nueva-123456" })).estado === 400);
  ok("una contraseña corta se rechaza", (await j("/api/cuenta/recuperar", { token, contrasena: "123" })).estado === 400);
  const nueva = crypto.randomUUID();
  const cambio = await j("/api/cuenta/recuperar", { token, contrasena: nueva });
  ok("con el enlace se elige otra contraseña y se entra", cambio.estado === 200 && cambio.datos?.clave === alta.datos?.clave, `(${cambio.estado})`);
  ok("el enlace sirve una sola vez", (await j("/api/cuenta/recuperar", { token, contrasena: crypto.randomUUID() })).estado === 400);
  ok("la contraseña vieja ya no entra", (await j("/api/cuenta", { email: mail, contrasena })).estado === 401);
  ok("la nueva sí", (await j("/api/cuenta", { email: mail, contrasena: nueva })).estado === 200);

  // --- Baja por mail -------------------------------------------------------------------------------
  const baja = await j("/api/eliminar-cuenta", { email: mail });
  ok("el pedido de baja avisa que llega un enlace", baja.estado === 201 && baja.datos?.porMail === true);
  const correoDeBaja = (await bandeja(mail)).find((c) => /eliminar/i.test(c.asunto));
  const confirmar = enlaceDe(correoDeBaja?.texto ?? "", "/eliminar-cuenta");
  ok("llega el mail para confirmar la baja", Boolean(confirmar));
  ok("un enlace de baja inventado no sirve", (await j("/api/eliminar-cuenta", { confirmar: "y".repeat(43) })).estado === 400);
  ok("la cuenta sigue hasta confirmar", (await j("/api/cuenta", { email: mail, contrasena: nueva })).estado === 200);
  const confirmada = await j("/api/eliminar-cuenta", { confirmar });
  ok("con el enlace se elimina la cuenta", confirmada.estado === 200 && confirmada.datos?.eliminada === true, `(${confirmada.estado})`);
  ok("el enlace de baja sirve una sola vez", (await j("/api/eliminar-cuenta", { confirmar })).estado === 400);
  const despues = await j("/api/cuenta", { email: mail, contrasena: nueva });
  ok("después de la baja, ese mail es una cuenta nueva", despues.estado === 200 && despues.datos?.nueva === true && despues.datos.clave !== alta.datos?.clave);
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
