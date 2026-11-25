# Mapa real con Mapbox: qué tiene que hacer la usuaria

El código ya está hecho. Mientras no esté el token, la app sigue con el mapa dibujado y no se comparte ninguna ubicación. No creé ninguna cuenta.

## Pasos

1. Crear una cuenta en https://account.mapbox.com/auth/signup. Pide una tarjeta, pero el uso de la app entra holgado en el plan gratis: 50.000 cargas de mapa web y 100.000 búsquedas de direcciones por mes.
2. En https://account.mapbox.com/access-tokens/ tocá **Create a token**:
   - **Name:** NecesitoYa
   - **Scopes:** dejá solo los públicos que vienen marcados (`styles:tiles`, `styles:read`, `fonts:read`, `datasets:read`, `vision:read`). No marques ningún scope secreto.
   - **URL restrictions:** agregá `https://necesitoya.gabriel13iturre.workers.dev`. Así el token solo sirve desde la app. Para probar en tu compu, sumá también `http://localhost:3000`.
   - Guardá y copiá el token: empieza con `pk.`.
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
