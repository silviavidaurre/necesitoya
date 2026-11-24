# webpush-avisos

**Qué hace.** Avisos en el navegador: presupuesto nuevo, mensaje, "te eligieron", pago, trabajo terminado, reclamo.
- El aviso se guarda para la cuenta y el push solo despierta al service worker (`public/sw.js`), sin texto adentro.
- El service worker trae el aviso de `/api/avisos/ultimo`.

**Variables.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.

**Dónde se llama.** `src/lib/avisos.ts` (decide a quién y por dónde), `src/app/api/avisos` y `src/app/api/avisos/ultimo`.

**Cómo se prueba.** `node pruebas/avisos.mjs [url]`. La llegada al celular se prueba a mano.
