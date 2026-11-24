# anthropic-ia

**Qué hace.** Con un modelo de lenguaje de Anthropic (SDK oficial, salida con esquema zod):
- convierte el relato del vecino, y su foto si la hay, en un pedido: título, descripción, oficio, urgencia, precio orientativo y diagnóstico (`armarPedido`);
- arma el perfil del prestador con lo que cuenta (`armarPerfil`).

Las reglas de seguridad del diagnóstico (gas y electricidad) no dependen de la IA: están en `src/lib/diagnostico.ts`.

**Variables.** `ANTHROPIC_API_KEY`. Sin ella, la app sigue en modo básico, con reglas.

**Dónde se llama.** `src/app/api/ia/pedido`, `src/app/api/ia/perfil`, `src/lib/fotos.ts` y `/api/stats` (dice si hay IA).

**Cómo se prueba.** `node pruebas/circuito.mjs` y `node pruebas/prestador.mjs`. Los recortes de texto están en `pruebas/` y en `src/lib/texto.ts`.
