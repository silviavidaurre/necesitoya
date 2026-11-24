# capacitor-android

**Qué hace.** Lo que cambia cuando la web corre adentro de la app de Android, que es Capacitor y abre la versión publicada:
- el botón atrás del celular;
- los avisos nativos (Firebase);
- entrar con Google nativo (`@capgo/capacitor-social-login`);
- el dictado que graba directo.

Cada función pregunta si la versión instalada de la app la trae, así las versiones viejas siguen andando.

**Variables.** No usa. La configuración nativa está en `capacitor.config.ts` y en `android/`. El paquete firmado lo arma `.github/workflows/android.yml` con una etiqueta `android-v*`.

**Dónde se llama.** `src/main.tsx`, `src/components/{EntrarACuenta,ActivarAvisos,useAtras,useDictado}`.

**Cómo se prueba.** En un celular real, con el paquete de la prueba interna de Play: botón atrás, micrófono, cámara, avisos y Google.
