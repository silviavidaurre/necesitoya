# Mapa real con Mapbox: qué tiene que hacer la usuaria

El código ya está hecho. Mientras no esté el token, la app sigue con el mapa dibujado y no se comparte ninguna ubicación. No creé ninguna cuenta.

## Pasos

1. Crear una cuenta en https://account.mapbox.com/auth/signup. Pide una tarjeta, pero el uso de la app entra holgado en el plan gratis: 50.000 cargas de mapa web y 100.000 búsquedas de direcciones por mes.
2. El token: en https://account.mapbox.com/access-tokens/ está el **Default public token** (empieza con `pk.`). Es el que usa hoy la app.
   - Una cuenta sin tarjeta no deja crear tokens nuevos ni ponerles restricciones, pero tampoco cobra: si se pasa del plan gratis, el mapa deja de cargar hasta el mes siguiente.
   - Si la cuenta tiene otras apps, todas usan el mismo token y suman al mismo cupo gratis.
   - **Si un día se agrega una tarjeta**, antes conviene crear un token propio (**Create a token**, solo scopes públicos, **URL restrictions** con `https://necesitoya.gabriel13iturre.workers.dev` y `http://localhost:3000`) y reemplazar el de abajo: con tarjeta, un token sin restricciones copiado de la app podría generar cobros.
3. Cargalo en el Worker desde la carpeta `necesitoya`. El comando pide pegar el valor; no lo pongas en el comando ni en el repo:
   ```
   npx wrangler secret put MAPBOX_TOKEN
   ```
   El token es público (lo usa el navegador), pero igual va como secreto para no dejarlo en el código.
4. Avisame y pruebo:
   - que `/api/mapa` dé el token;
   - que el seguimiento muestre el mapa real;
   - que el barrio demo muestre a Ramiro en camino sobre Alto Comedero.

## Para la app de Android

El permiso de ubicación es nativo, así que hace falta la versión **1.2.0** en Play: la etiqueta `android-v1.2.0`. En Play Console:
- **Seguridad de los datos:** declarar "Ubicación precisa y aproximada", recolectada, solo para la funcionalidad de la app, no compartida para publicidad, usada solo con la app abierta.
- **Permisos:** como es ubicación con la app en uso (no en segundo plano), no pide el formulario de ubicación en segundo plano.

## Cómo se ve sin token

Todo igual que hoy: mapa dibujado, y en vez de "En vivo" dice "Se actualiza solo", porque no hay ubicación real.
