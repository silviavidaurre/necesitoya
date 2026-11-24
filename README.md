# NecesitoYa

No te mostramos una lista. Te decimos qué tenés, cuánto cuesta y quién lo arregla, y tu plata queda protegida hasta que esté hecho. Hecha para San Salvador de Jujuy y Palpalá, en el Cursor Hackathon Jujuy (Tren Solar, noviembre de 2026), por Gabriel y Silvia.

Publicada en https://necesitoya.gabriel13iturre.workers.dev

## Qué hace

- **Diagnóstico.** El vecino cuenta lo que le pasa hablando, escribiendo o con una foto. La IA arma el pedido y un diagnóstico orientativo: lo más probable, el riesgo, qué hacer ya, materiales y preguntas para el prestador. Con gas o electricidad siempre avisa que hace falta un matriculado y da los pasos de seguridad.
- **Presupuestos.** Hasta tres prestadores mandan su precio; el último lugar queda reservado 15 minutos para los del barrio. Cada uno dice si está **verificado** (DNI y, si tiene, matrícula revisados a mano) o **sin verificar**.
- **Trabajo tipo Uber.** El prestador ofrece días y franjas al presupuestar; el vecino elige uno y carga la dirección, que es privada (solo la ve el prestador elegido mientras el trabajo está activo, y se borra al terminar o cancelar). El prestador avanza los estados con un botón (Confirmado, En camino, Llegó, Trabajando, Terminado) y el vecino los sigue en vivo sobre un mapa dibujado. Llamadas sin mostrar el número: pendiente (necesita un proveedor de telefonía).
- **Chat dentro de la app**, como acción secundaria para las excepciones. Nadie ve el teléfono de nadie: los números que se pegan se ocultan. Se puede denunciar o bloquear desde el chat.
- **Pago por la app (Cosmos Pay, USDC en Stellar).** Protegido: la plata queda retenida hasta que el vecino confirma. Mientras Cosmos no publique los pagos protegidos en su API, se cobra directo con la comisión fija separada en la misma transacción (`merchantFee`). Mercado Pago marketplace está armado detrás de configuración.
- **Cierre del trabajo.** El prestador marca "Trabajo terminado" con la foto del después, el vecino confirma y recién ahí califica. El perfil público muestra el historial: trabajos terminados, cobrados por la app y reseñas.
- **Reclamos y cancelaciones.** Cancelar, cambiar el día y reclamar con fotos (el chat sirve de prueba), conectado a la disputa del pago protegido.
- **Cuenta obligatoria** para pedir y presupuestar (mail y contraseña, sin código, o Google).
- **Avisos en el celular** (web push) y **app instalable**.
- **Eliminar la cuenta** desde "Mi cuenta" o sin entrar, en `/eliminar-cuenta` (lo pide Google Play): se borra lo personal y se anonimiza lo que hay que guardar (pagos hechos, reclamos abiertos).
- **Panel interno** en `/admin` (con secreto): verificaciones, denuncias, reclamos, métricas sin datos de muestra ni de prueba, y limpieza de los datos de las pruebas.

## Con qué está hecha

- Vite, React 19, React Router 7, Tailwind 4 y TypeScript. Diseño: negro, blanco y un acento naranja; Space Grotesk e Inter; el lado del prestador va oscuro (tokens en `src/app/globals.css`).
- API en `src/app/api/**/route.ts`, registrada en `src/servidor/rutas.ts`.
- En producción corre en un Worker de Cloudflare con una base D1 (`src/servidor/worker.ts`, `wrangler.jsonc`), con una tabla por colección (`src/servidor/almacen-d1.ts`). La primera vez migra sola desde la fila única `estado`, que queda intacta como respaldo. En desarrollo guarda en un archivo local.
- IA: Claude, con el SDK de Anthropic (`src/lib/ia.ts`). Sin clave, la app sigue andando en un modo básico por reglas.
- Voz: ElevenLabs (`src/lib/voz.ts`). Pagos: Cosmos Pay (`src/lib/cosmos.ts`) y Mercado Pago (`src/lib/mercadopago.ts`). Avisos: web push con VAPID (`src/lib/push.ts`, `public/sw.js`).

## Correrla en tu máquina

```bash
npm install
```

Copiá `.env.example` como `.env.local` y completá las claves que tengas. Después:

```bash
npm run dev
```

Queda en http://localhost:3000. Para probar el Worker real con D1 local: `npx vite build` y `npx wrangler dev` (lee los secretos de `.dev.vars`, que no se sube).

## Pruebas

Con la app corriendo, cada tanda se corre contra una dirección:

```bash
node pruebas/circuito.mjs http://localhost:3000
```

Las tandas son `circuito`, `prestador`, `muestra`, `chat`, `cuenta`, `voz`, `confianza` (diagnóstico, verificado, cierre, pagos, webhook), `avisos` (push y app instalable), `turnos` (días, dirección privada y estados), `eliminar` (eliminar la cuenta y cuentas de revisión) y `moderacion` (verificación, reclamos, denuncias, bloqueos, panel, límites, métricas). Usan cuentas con mail `.test`: lo que crean no cuenta en las métricas y se borra con:

```bash
node pruebas/limpiar.mjs https://necesitoya.gabriel13iturre.workers.dev --borrar
```

## Publicar

```bash
npx vite build
```

```bash
npx wrangler deploy
```

Secretos del Worker (nunca en el repositorio): `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `VAPID_PRIVATE_KEY`, `ADMIN_SECRET`, `COSMOS_API_KEY`, `COSMOS_WALLET_COMISION`, `COSMOS_WEBHOOK_SECRET` y, para Mercado Pago, `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y `MP_WEBHOOK_SECRET`. Ajustes opcionales: `COMISION_USDC` (por defecto 1), `COMISION_ARS` (1500), `ARS_POR_USDC` (si no, el dólar cripto del día), `COSMOS_MODO` (`protegido` o `directo`).
