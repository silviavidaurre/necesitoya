# NecesitoYa

Pedís con un audio lo que se te rompió y te llegan hasta tres presupuestos de gente de tu barrio. Hecha para San Salvador de Jujuy y Palpalá, en el Cursor Hackathon Jujuy (Tren Solar, noviembre de 2026), por Gabriel y Silvia.

Publicada en https://necesitoya.gabriel13iturre.workers.dev

## Qué hace

- **El vecino** cuenta lo que necesita hablando, escribiendo o con una foto. La IA arma el pedido: título, rubro, urgencia y cuánto suele costar la mano de obra.
- **Hasta tres prestadores** mandan su precio. El último lugar queda reservado 15 minutos para los del barrio.
- **El vecino compara y elige.** Se abre un chat dentro de la app: nadie ve el teléfono de nadie, y los números que se pegan en el chat se ocultan.
- **El prestador** se anota contando por voz qué hace; la IA le arma el perfil. Cada trabajo calificado suma a su reputación.
- **Voz:** dictado y lectura en voz alta, para quien no se lleva con escribir.
- **Cuenta opcional** con mail y contraseña o con Google, para no perder el perfil ni los pedidos al cambiar de celular.

Lo que todavía no está construido: el cobro, el trámite de verificación de prestadores y los avisos cuando la app está cerrada.

## Con qué está hecha

- Vite, React 19, React Router 7, Tailwind 4 y TypeScript.
- API en `src/app/api/**/route.ts`, registrada en `src/servidor/rutas.ts`.
- En producción corre en un Worker de Cloudflare con una base D1 (`src/servidor/worker.ts`, `wrangler.jsonc`). En desarrollo guarda en un archivo local.
- IA: Claude, con el SDK de Anthropic (`src/lib/ia.ts`). Sin clave, la app sigue andando en un modo básico por reglas.
- Voz: ElevenLabs (`src/lib/voz.ts`).

## Correrla en tu máquina

```bash
npm install
```

Copiá `.env.example` como `.env.local` y completá las claves que tengas. Después:

```bash
npm run dev
```

Queda en http://localhost:3000.

## Pruebas

Con la app corriendo, cada tanda se corre contra una dirección:

```bash
node pruebas/circuito.mjs http://localhost:3000
```

Las tandas son `circuito`, `prestador`, `muestra`, `chat`, `cuenta` y `voz`. Crean datos de prueba en la base a la que apuntan.

## Publicar

```bash
npx vite build
```

```bash
npx wrangler deploy
```

Las claves `ANTHROPIC_API_KEY` y `ELEVENLABS_API_KEY` van como secretos del Worker, nunca en el repositorio.
