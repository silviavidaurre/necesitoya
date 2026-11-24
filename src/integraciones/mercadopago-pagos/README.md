# mercadopago-pagos

**Qué hace.** Pagos en pesos con Mercado Pago, como marketplace.
- Cada prestador conecta su cuenta (OAuth).
- El vecino le paga directo.
- La comisión fija de NecesitoYa se separa con `marketplace_fee`.

**Variables.** `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET` y, opcional, `COMISION_ARS`. Sin ellas, la app no muestra Mercado Pago. Los pasos para crear la aplicación están en `docs/mercadopago-pasos.md`.

**Dónde se llama.** `src/app/api/mercadopago/{conectar,vuelta,webhook}`, `src/app/api/pagos` y `src/lib/pagos.ts`.

**Cómo se prueba.** Sin credenciales, `/api/stats` dice `"mercadopago": false` y todo lo demás anda. Con credenciales, se prueba a mano: conectar un prestador de prueba y pagar con un usuario de prueba de Mercado Pago.

**Pendiente.** El permiso de cada prestador vence a los 180 días. Hay que renovarlo con el `refresh_token`, que ya se guarda.
