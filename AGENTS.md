# AGENTS.md: cómo trabajar en NecesitoYa

Guía para personas y agentes que tocan este repositorio. El README es para quien usa o evalúa la app; esto es para quien la cambia.

## Mapa

```
src/
  main.tsx                 rutas de las pantallas (react-router)
  app/                     una carpeta por pantalla (page.tsx)
    api/**/route.ts        la API: GET/POST con Request y Response estándar
  components/              piezas de pantalla (ui.tsx = botones, campos, pantalla)
  lib/                     reglas propias de la app, sin servicios externos
    db.ts                  leer() y modificar(): todo pasa por acá
    tipos.ts               el modelo de datos (Pedido, Oferta, Prestador, Cuenta…)
    reglas.ts, trabajo.ts, turnos.ts, pagos.ts, chat.ts, moderacion.ts, bajas.ts, demo.ts, metricas.ts…
  integraciones/           un servicio externo por carpeta, cada una con su README
    anthropic-ia  elevenlabs-voz  cosmos-pagos  mercadopago-pagos
    webpush-avisos  firebase-avisos  resend-correo  google-cuenta  capacitor-android  mapbox-mapa
  servidor/
    rutas.ts               registro de la API (cada ruta nueva se agrega acá a mano)
    cloudflare/            producción: Worker + D1, una tabla por colección
    local/                 desarrollo: Vite + archivo local
pruebas/                   tandas de pruebas contra una URL (node pruebas/<tanda>.mjs [url])
scripts/                   íconos, capturas de Play, correr todas las pruebas
public/                    estáticos (sw.js, íconos, public/demo = ilustraciones del barrio demo)
android/                   app de Android (Capacitor 8): abre la versión publicada
docs/                      pasos para la usuaria (correo, Mercado Pago) y capturas
.github/workflows/         paquete de Android firmado al subir una etiqueta android-v*
```

## Comandos

```
npm ci                                   instalar
npm run dev                              app y API en http://localhost:3000 (claves en .env.local)
npx tsc --noEmit                         tipos
node scripts/pruebas.mjs [url]           todas las tandas y limpieza de lo que crearon
node pruebas/<tanda>.mjs [url]           una tanda
node pruebas/limpiar.mjs [url] --borrar  borra solo lo creado por cuentas .test
npx vite build && npx wrangler deploy    publicar en Cloudflare
```

Producción: https://necesitoya.gabriel13iturre.workers.dev

## Reglas

- **No imprimir claves.** Ni en código, logs, commits, PRs ni mensajes. Se leen con `variable()` (`src/lib/config.ts`). En local van en `.env.local` (no se sube) y en Cloudflare con `npx wrangler secret put`. Las pruebas leen secretos con `secretoLocal()` sin mostrarlos.
- **No vaciar producción.** Nunca borrar tablas ni filas a mano sin mirar antes qué hay. Para limpiar pruebas: `pruebas/limpiar.mjs --borrar` (solo cuentas `.test`). Antes de cambiar el esquema de la base, sacar un respaldo: `npx wrangler d1 export necesitoya --remote --output <archivo>`.
- **Nada de tracción inventada.** Lo que no es uso real va marcado y no cuenta en `/api/stats` ni en las métricas:
  - `ejemplo`: pedidos y presupuestos de muestra para practicar;
  - `dePrueba` o mails `.test`: lo que crean las pruebas automáticas;
  - `revision`: las cuentas del revisor de Google Play;
  - `demo`: el barrio de demostración (`src/lib/demo.ts`), que se carga o se borra desde `/admin` → Demo y no se cruza con lo real.
- **Lo privado no sale.** Teléfonos (se tapan en chat, presupuestos, pedidos y perfiles), dirección (solo el prestador elegido, mientras dura el trabajo), id secreto del prestador y clave del pedido. `pruebas/chat.mjs` lo controla.
- **Sin firma.** Commits, PRs y textos sin líneas de "generado por" ni coautorías automáticas.
- **Probar antes de publicar.** `tsc` limpio y las tandas en verde en local, después publicar y correrlas en producción. Las pantallas nuevas se miran a tamaño celular.
- **Ramas y PRs.** Un PR por bloque desde `main`. Las versiones de Android las publica la sesión principal o la usuaria (etiqueta `android-vX.Y.Z`).

## Para sumar algo

- **Una ruta de la API:** crear `src/app/api/<ruta>/route.ts` y registrarla en `src/servidor/rutas.ts`.
- **Una colección nueva en la base:** el tipo en `tipos.ts` (`BaseDeDatos`), la clave en `COLECCIONES` de `servidor/cloudflare/almacen-d1.ts`, y subir `ESQUEMA`.
- **Un servicio externo:** una carpeta en `src/integraciones/` con su README (qué hace, variables, dónde se llama, cómo se prueba). Que se apague solo si falta su variable.
- **Un límite diario:** `CUPOS` o `CUPOS_POR_PERSONA` en `src/lib/db.ts`.
