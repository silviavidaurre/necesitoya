# firebase-avisos

**Qué hace.** Avisos nativos en la app de Android, con Firebase Cloud Messaging (HTTP v1). Firma un JWT con la cuenta de servicio, pide el token de OAuth y manda el mensaje. Los celulares se anotan como `fcm:<token>`.

**Variables.**
- `FCM_SERVICE_ACCOUNT`: el JSON de la cuenta de servicio, como secreto del Worker.
- La app se arma con `google-services.json`, que viene del secreto de GitHub `NECESITOYA_GOOGLE_SERVICES_JSON_BASE64` (ver `.github/workflows/android.yml`).

**Dónde se llama.** `src/lib/avisos.ts` y `src/app/api/avisos`. En la app: `integraciones/capacitor-android/nativo.ts`.

**Cómo se prueba.** `node pruebas/avisos.mjs [url]` comprueba que el servidor acepta y rechaza bien los identificadores. La llegada al celular se prueba a mano.
