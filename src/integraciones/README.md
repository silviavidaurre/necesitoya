# Integraciones

Cada carpeta es un servicio externo. Todo lo que habla con ese servicio vive ahí, y el resto de la app usa sus funciones.
Si falta la variable de un servicio, esa parte se apaga sola y la app sigue andando.

| Carpeta | Servicio | Para qué |
| --- | --- | --- |
| `anthropic-ia` | Anthropic | Ordena el pedido, arma el diagnóstico y el perfil del prestador |
| `elevenlabs-voz` | ElevenLabs | Pasa la voz a texto y lee en voz alta |
| `cosmos-pagos` | Cosmos Pay (Stellar, USDC) | Pagos dentro de la app con la comisión separada |
| `mercadopago-pagos` | Mercado Pago | Pagos en pesos (apagado hasta cargar las credenciales) |
| `webpush-avisos` | Web push (VAPID) | Avisos en el navegador |
| `firebase-avisos` | Firebase Cloud Messaging | Avisos en la app de Android |
| `resend-correo` | Resend | Mails: recuperar la contraseña y confirmar una baja (apagado hasta configurar) |
| `mapbox-mapa` | Mapbox | Mapa real del seguimiento y el prestador en camino (apagado hasta cargar el token) |
| `google-cuenta` | Google | Entrar con Google (web y app de Android) |
| `capacitor-android` | Capacitor | Lo propio de la app de Android: botón atrás, avisos nativos, Google nativo |

Las variables se leen con `variable()` de `src/lib/config.ts`. En desarrollo salen de `.env.local` y en Cloudflare son secretos del Worker (`npx wrangler secret put NOMBRE`). Nunca van en el código.
