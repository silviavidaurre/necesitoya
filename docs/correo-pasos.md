# Mails de NecesitoYa: qué tiene que hacer la usuaria

## Lo que ya funciona hoy, sin mandar mails

- Crear cuenta y entrar con mail y contraseña. No hace falta confirmar el mail.
- Las cuentas de prueba terminan en `.test`: no cuentan en las métricas y se borran con `pruebas/limpiar.mjs`.
- El pedido de borrado sin entrar a la app (`/eliminar-cuenta`): queda en el panel `/admin`, en "Bajas", y el equipo lo resuelve en hasta 7 días hábiles.
- El mail de soporte en las páginas (privacidad, términos y eliminar cuenta): gabriel13iturre@gmail.com.

## Lo que se prende con el correo

El código ya está hecho, detrás de configuración (`src/integraciones/resend-correo/correo.ts`). Con el correo prendido:

- **"¿Olvidaste tu contraseña?"** en la pantalla de entrar. Llega un enlace que sirve una sola vez y vence en 30 minutos.
- **Baja por mail**: al pedirla en `/eliminar-cuenta` llega un enlace para confirmar. Al abrirlo, la cuenta se borra en el momento, sin esperar al equipo.

Mientras no esté configurado, esos botones no aparecen y todo sigue como hoy.

## Pasos (con el proveedor Resend)

No creé ninguna cuenta. Lo tiene que hacer la usuaria:

1. Crear una cuenta en https://resend.com. El plan gratis alcanza: 3.000 mails por mes.
2. **Verificar un dominio** en Resend → Domains → Add Domain. Por ejemplo `necesitoya.com.ar`, o un subdominio como `mail.iturrelabs.com`. Resend muestra registros DNS (SPF, DKIM y opcionalmente DMARC) para cargar donde se administra ese dominio. Hay que esperar a que diga "Verified".
   - No se puede usar `workers.dev` ni un Gmail como remitente: hace falta un dominio propio.
   - Sin dominio, Resend solo deja mandar mails de prueba a la casilla de la cuenta de Resend. Sirve para probar, no para la app.
3. En Resend → API Keys → Create API Key, con permiso **Sending access** solo para ese dominio. Copiarla: se ve una sola vez.
4. Cargar las dos variables en el Worker, desde la carpeta `necesitoya`. Cada comando pide pegar el valor; no lo pongas en el comando ni en un archivo del repo:
   ```
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put MAIL_REMITENTE
   ```
   `MAIL_REMITENTE` lleva nombre y mail del dominio verificado, por ejemplo: `NecesitoYa <hola@necesitoya.com.ar>`.
5. Opcional: `npx wrangler secret put MAIL_RESPUESTA` con el mail al que llegan las respuestas. Si no se carga, es gabriel13iturre@gmail.com.
6. Avisarme. Corro `node pruebas/correo.mjs https://necesitoya.gabriel13iturre.workers.dev`: usa mails `.test`, que nunca se mandan, así que no gasta cupo. Después pedís una recuperación con tu mail real para ver que llegue y que no caiga en spam.

## Cómo se prueba sin mandar nada

`pruebas/correo.mjs` prueba los dos casos:

- **Sin correo:** todo sigue andando y los botones no aparecen.
- **Con correo:** los mails a direcciones `.test` no salen nunca. Quedan en una bandeja de prueba (últimos 50) que solo lee el panel interno, con `ADMIN_SECRET`. La prueba sigue el enlace desde ahí.

En local se activa poniendo en `.env.local`:

```
RESEND_API_KEY=solo-pruebas-local
MAIL_REMITENTE=NecesitoYa <pruebas@necesitoya.test>
```
