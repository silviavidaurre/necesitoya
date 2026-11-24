import { variable } from "./config";
import { modificar, nuevoId } from "./db";
import type { CorreoDePrueba } from "./tipos";

// Correos de la app (recuperar la contraseña, confirmar que se borre una cuenta), con Resend.
// Queda apagado hasta que estén las dos variables:
//   RESEND_API_KEY  la clave de la API de Resend (secreto del Worker)
//   MAIL_REMITENTE  quién manda, con un dominio verificado en Resend. Ej: "NecesitoYa <hola@necesitoya.com.ar>"
// Opcional: MAIL_RESPUESTA, a dónde llegan las respuestas (por defecto, el mail de soporte).
//
// Los mails a direcciones que terminan en .test (las cuentas de prueba) nunca se mandan: quedan en una bandeja
// de prueba que solo se lee desde el panel interno. Así las pruebas pueden seguir el enlace sin mandar nada.

const API = "https://api.resend.com/emails";
const EN_LA_BANDEJA = 50;
export const MAIL_DE_SOPORTE = "gabriel13iturre@gmail.com";

export function correoDisponible() {
  return Boolean(variable("RESEND_API_KEY") && variable("MAIL_REMITENTE"));
}

export function esMailDePrueba(email: string) {
  return email.toLowerCase().endsWith(".test");
}

// Manda un correo de texto. Devuelve si salió (o si quedó en la bandeja de prueba).
export async function enviarCorreo(correo: { para: string; asunto: string; texto: string }): Promise<boolean> {
  if (!correoDisponible()) return false;
  if (esMailDePrueba(correo.para)) {
    const guardado: CorreoDePrueba = { id: nuevoId(), ...correo, creado: new Date().toISOString() };
    await modificar((db) => {
      db.correos = [...(db.correos ?? []), guardado].slice(-EN_LA_BANDEJA);
    });
    return true;
  }
  try {
    const respuesta = await fetch(API, {
      method: "POST",
      headers: { authorization: `Bearer ${variable("RESEND_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: variable("MAIL_REMITENTE"),
        to: [correo.para],
        reply_to: variable("MAIL_RESPUESTA") ?? MAIL_DE_SOPORTE,
        subject: correo.asunto,
        text: correo.texto,
      }),
    });
    if (!respuesta.ok) console.error("[correo]", respuesta.status, (await respuesta.text().catch(() => "")).slice(0, 200));
    return respuesta.ok;
  } catch (error) {
    console.error("[correo] sin conexión", error instanceof Error ? error.message : "");
    return false;
  }
}

// Enlaces de un solo uso (recuperar la contraseña, confirmar una baja). En la base se guarda solo la huella:
// quien lea la base no puede usar el enlace.
export function nuevoEnlace(minutos: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, vence: new Date(Date.now() + minutos * 60_000).toISOString() };
}

export async function huellaDeEnlace(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function enlaceValido(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(token);
}
