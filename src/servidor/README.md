# servidor

La API es una sola. `rutas.ts` busca la ruta y el método y llama a `src/app/api/**/route.ts`. Trabaja con `Request` y `Response` estándar. Cada ruta nueva se registra a mano en `rutas.ts`.

- `cloudflare/`: producción. `worker.ts` es la entrada del Worker: la API usa D1 y el resto son archivos estáticos. `almacen-d1.ts` guarda una tabla por colección (`t_<coleccion>`), con control de versión optimista. Cuando se suma una colección, se sube la marca `ESQUEMA`, que crea la tabla sin migrar nada.
- `local/`: desarrollo. `desarrollo.ts` lo carga Vite (`vite.config.ts`) y `almacen-archivo.ts` guarda en un archivo local.

El resto de la app solo usa `leer()` y `modificar()` de `src/lib/db.ts`.
