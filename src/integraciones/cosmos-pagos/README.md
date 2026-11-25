# cosmos-pagos

**Qué hace.** Pagos dentro de la app con Cosmos Pay, en USDC sobre Stellar.
- **Hoy:** pago directo al prestador, con la comisión de NecesitoYa separada (`merchantFee`).
- **Pago protegido** (la plata queda retenida hasta que el vecino confirma): la app lo activa sola cuando Cosmos publique `/v1/protected-payments`. Lo vuelve a preguntar cada 30 minutos (`sondearProtegidos`).
- `stellar.ts` valida las billeteras.
- El webhook se firma con HMAC (`t=..,v1=..`).
- **Si Cosmos frena el pedido.** La API de Cosmos está detrás de la protección antibots de Cloudflare, que a veces responde un 403 "Just a moment..." a los pedidos del Worker. `llamar()` reintenta hasta 4 veces. Si sigue frenado, o si no hay conexión o Cosmos está caído, `POST /api/pagos` no da error: responde `202 { preparando: true }`. La pantalla del pedido muestra "Estamos preparando tu pago" y vuelve a pedirlo cada 5 segundos, hasta unos 3 minutos.

**Variables.**
- `COSMOS_API_KEY`
- `COSMOS_WALLET_COMISION`: la billetera que cobra la comisión; tiene que aceptar USDC.
- `COSMOS_WEBHOOK_SECRET`
- Solo para pruebas locales: `COSMOS_BASE`, para apuntar a un Cosmos falso.
- Opcionales: `COSMOS_MODO` (`directo` o `protegido`, para forzar), `COSMOS_PLAZO_HORAS` y `COSMOS_POLITICA`.
- Comisión: `COMISION_USDC` y `ARS_POR_USDC`, en `src/lib/pagos.ts`.

**Dónde se llama.** `src/app/api/pagos`, `src/app/api/pagos/webhook`, `src/app/api/pedido`, `src/app/api/pedido/cancelar`, `src/app/api/prestadores` (billetera) y `src/lib/pagos.ts`.

**Cómo se prueba.** `node pruebas/confianza.mjs [url]`: arma un pago real en testnet y prueba la firma del webhook.
- `node pruebas/preparando.mjs [url]`: con un Cosmos falso que frena los pedidos, prueba que la app responda "preparando" y después arme el pago. Solo en local, con el servidor levantado con `COSMOS_BASE=http://127.0.0.1:4010`.
