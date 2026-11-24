# elevenlabs-voz

**Qué hace.** Pasa a texto lo que el vecino o el prestador dicen al micrófono y lee en voz alta los pedidos y los presupuestos.
- `voz.ts` es la parte del servidor.
- `voz-cliente.ts` es la del navegador: grabar, mandar y reproducir.

**Variables.** `ELEVENLABS_API_KEY`. Sin ella, la app usa el dictado y la voz del navegador cuando los hay.

**Dónde se llama.** `src/app/api/voz`, `src/app/api/voz/transcribir`, `src/app/api/voz/decir`, `src/components/BotonEscuchar.tsx` y `src/components/useDictado.ts`.

**Cómo se prueba.** `node pruebas/voz.mjs [url]`.
