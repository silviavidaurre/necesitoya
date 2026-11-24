import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

type Atender = (peticion: Request) => Promise<Response>;

async function cuerpoDe(req: IncomingMessage): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const trozo of req) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos);
}

// Sirve la API de NecesitoYa desde el mismo servidor de desarrollo: todo lo que empieza
// con /api/ se pasa a src/servidor/rutas.ts, que trabaja con Request y Response estándar.
function apiNecesitoYa(): Plugin {
  return {
    name: "api-necesitoya",
    configureServer(servidor: ViteDevServer) {
      servidor.middlewares.use(async (req: IncomingMessage, res: ServerResponse, siguiente: () => void) => {
        if (!req.url?.startsWith("/api/")) return siguiente();
        try {
          const modulo = (await servidor.ssrLoadModule("/src/servidor/desarrollo.ts")) as { atender: Atender };
          const metodo = req.method ?? "GET";
          const conCuerpo = metodo !== "GET" && metodo !== "HEAD";
          const peticion = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
            method: metodo,
            headers: Object.entries(req.headers).flatMap(([clave, valor]) =>
              valor === undefined ? [] : [[clave, Array.isArray(valor) ? valor.join(", ") : valor] as [string, string]],
            ),
            body: conCuerpo ? new Uint8Array(await cuerpoDe(req)) : undefined,
          });
          const respuesta = await modulo.atender(peticion);
          res.statusCode = respuesta.status;
          respuesta.headers.forEach((valor, clave) => res.setHeader(clave, valor));
          res.end(Buffer.from(await respuesta.arrayBuffer()));
        } catch (error) {
          servidor.ssrFixStacktrace(error as Error);
          console.error("[api]", error);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Error interno del servidor." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Las claves del archivo .env.local quedan disponibles para el código del servidor.
  const entorno = loadEnv(mode, process.cwd(), "");
  for (const clave of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ELEVENLABS_API_KEY", "GOOGLE_CLIENT_ID"]) {
    if (entorno[clave] && !process.env[clave]) process.env[clave] = entorno[clave];
  }

  return {
    plugins: [react(), tailwindcss(), apiNecesitoYa()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true },
  };
});
