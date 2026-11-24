# Mercado Pago en NecesitoYa: qué tiene que hacer la usuaria

El código ya está hecho y publicado. Mientras falten las credenciales, la app no muestra Mercado Pago.
Yo no creé cuentas ni aplicaciones.

Cómo funciona: cada prestador conecta su cuenta de Mercado Pago, el vecino le paga en pesos directo a esa cuenta, y Mercado Pago separa sola la comisión fija de NecesitoYa con `marketplace_fee`. La plata no queda retenida.

## 1. Crear la aplicación (con la cuenta de Mercado Pago que va a cobrar las comisiones)

1. Entrá a https://www.mercadopago.com.ar/developers/panel/app y tocá **Crear aplicación**.
2. Completá así:
   - **Nombre:** NecesitoYa
   - **Tipo de solución:** Pagos online
   - **¿Usás plataforma de e-commerce?** No
   - **Producto a integrar:** Checkout Pro
   - **Modelo de integración:** Marketplace. Es el que habilita OAuth y `marketplace_fee`. Si no aparece al crearla, buscalo después en la configuración de la aplicación.
3. En la aplicación, en **Configuración avanzada → URLs de redireccionamiento**, cargá exactamente:
   `https://necesitoya.gabriel13iturre.workers.dev/api/mercadopago/vuelta`
4. En **Webhooks → Configurar notificaciones**, en **Modo productivo**:
   - **URL:** `https://necesitoya.gabriel13iturre.workers.dev/api/mercadopago/webhook`
   - **Evento:** Pagos
   - Guardá y copiá la **clave secreta** que muestra esa pantalla.
5. En **Credenciales de producción**, copiá el **Client ID** y el **Client Secret**. No se usan el Access Token ni la Public Key de la cuenta.

## 2. Cargar las credenciales en el servidor

Desde la carpeta `necesitoya`, corré un comando por clave. Cada uno pide pegar el valor; no lo pongas en el comando ni en un archivo del repo.

```
npx wrangler secret put MP_CLIENT_ID
npx wrangler secret put MP_CLIENT_SECRET
npx wrangler secret put MP_WEBHOOK_SECRET
```

Opcional: la comisión fija en pesos es $1.500 por defecto. Para cambiarla:
`npx wrangler secret put COMISION_ARS` (por ejemplo, 2000).

Si querés probar en tu compu, también se pueden poner en `.env.local`. Ese archivo no se sube al repo.

## 3. Avisarme, y pruebo yo

Con eso cargado, compruebo:
- Que `/api/stats` diga `"mercadopago": true`.
- Que un prestador de prueba pueda tocar **Conectar Mercado Pago** y volver a la app.
- Que se arme el cobro con la comisión separada.

El pago con plata de verdad lo tiene que hacer una persona: yo no hago pagos.

## A tener en cuenta

- La aplicación tiene que estar a nombre de quien va a facturar las comisiones (Iturre Labs).
- Mercado Pago puede pedir que la cuenta esté verificada (identidad y datos fiscales) antes de dar credenciales de producción.
- Pendiente de código: el permiso que da cada prestador vence a los 180 días. Todavía no se renueva solo con el `refresh_token`, que ya se guarda. Hay que hacerlo antes de que el primer prestador cumpla 6 meses conectado.
