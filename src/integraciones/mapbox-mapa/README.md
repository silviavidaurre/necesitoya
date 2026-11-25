# mapbox-mapa

**Qué hace.** El mapa real del seguimiento, con Mapbox.
- Mientras el trabajo está activo, el vecino ve su casa en un mapa de Jujuy.
- Cuando el prestador sale para allá, su celular manda dónde está cada ~12 segundos (`src/components/useCompartirUbicacion.ts` → `/api/ofertas/ubicacion`) y el vecino lo ve moverse.
- Al llegar, terminar o cancelar, la ubicación se borra (`src/lib/trabajo.ts`).
- La dirección se ubica en el mapa desde el navegador, con la geocodificación de Mapbox, cada vez que se abre el mapa. No se guarda convertida en coordenadas.
- Si no la encuentra, el mapa se centra en el barrio.
- Sin token, la app usa el mapa dibujado (`src/components/Mapa.tsx`) y el celular no manda ubicación.

**Variables.** `MAPBOX_TOKEN`: un token **público** de Mapbox (empieza con `pk.`), restringido a la dirección web de la app. Los pasos están en `docs/mapbox-pasos.md`.

**Dónde se llama.**
- `Mapa.tsx`, con la prop `real`, en la pantalla de seguimiento (`src/app/pedido/page.tsx`).
- `useCompartirUbicacion`, en Mis presupuestos del prestador.
- `/api/mapa` le da el token a la app.

**Cómo se prueba.** `node pruebas/mapa.mjs [url]` prueba quién puede mandar ubicación, cuándo la ve el vecino y que se borre. El mapa y el GPS se prueban a mano, con token, en un celular.
