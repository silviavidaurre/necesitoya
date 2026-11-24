# google-cuenta

**Qué hace.** Entrar con Google. Valida el token que devuelve Google: que sea para esta app, que lo haya emitido Google y que esté vigente. Del lado de la persona guarda solo el identificador y el nombre de pila.
- En la web, el botón lo dibuja Google (`src/components/EntrarACuenta.tsx`).
- En la app de Android, lo hace el inicio de sesión nativo (`integraciones/capacitor-android/nativo.ts`), pedido con el mismo cliente web.

**Variables.** `GOOGLE_CLIENT_ID`: el cliente **web** de Google Cloud. Los clientes de Android (uno por huella SHA-1) solo tienen que existir en Google Cloud.

**Dónde se llama.** `src/app/api/cuenta`.

**Cómo se prueba.** `node pruebas/cuenta.mjs [url]` prueba el resto de la cuenta. Google se prueba a mano, en la web y en un celular.
