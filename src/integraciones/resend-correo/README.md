# resend-correo

**Qué hace.** Manda mails con Resend: el enlace para elegir otra contraseña y el enlace para confirmar que se borre una cuenta.
- Los enlaces sirven una sola vez; en la base se guarda solo su huella.
- Los mails a direcciones `.test` nunca salen: quedan en una bandeja de prueba que lee el panel (`/api/admin?seccion=correos`).

**Variables.** `RESEND_API_KEY`, `MAIL_REMITENTE` (con dominio verificado) y, opcional, `MAIL_RESPUESTA`. Sin las dos primeras está apagado y la app no muestra esos botones. Los pasos están en `docs/correo-pasos.md`.

**Dónde se llama.** `src/app/api/cuenta/recuperar`, `src/app/api/eliminar-cuenta`, `src/app/api/cuenta` (dice si hay correo) y `src/app/api/admin` (bandeja de prueba).

**Cómo se prueba.** `node pruebas/correo.mjs [url]`, con y sin correo.
