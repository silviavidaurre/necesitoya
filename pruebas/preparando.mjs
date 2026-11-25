// Prueba qué pasa cuando la protección antibots de Cosmos frena el pedido de pago: la app no muestra un error,
// responde "preparando" (202) y, cuando Cosmos vuelve a aceptar, arma el pago normal.
// Solo corre en local, contra un Cosmos falso que levanta esta misma prueba:
//   1) COSMOS_BASE=http://127.0.0.1:4010 npm run dev
//   2) node pruebas/preparando.mjs [url]
// No está en scripts/pruebas.mjs porque producción habla con el Cosmos de verdad.
import { createServer } from "node:http";
import { DIRECCION, cuentaDePrueba, turnoPara } from "./comun.mjs";

const U = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, extra = "") => {
  if (!cond) fallas++;
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre} ${extra}`);
};
const j = async (ruta, cuerpo) => {
  const r = await fetch(U + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  return { estado: r.status, datos: await r.json().catch(() => null) };
};

// --- Cosmos falso ----------------------------------------------------------------------------------
let frenar = true;
let desafios = 0;
const PAGINA_DE_DESAFIO = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-chl</body></html>";
const cosmos = createServer((pedido, respuesta) => {
  const ruta = pedido.url ?? "";
  if (ruta.startsWith("/v1/protected-payments")) {
    respuesta.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ code: "not_found", message: "Not found" }));
  } else if (ruta.startsWith("/v1/payment-intents")) {
    if (frenar) {
      desafios++;
      respuesta.writeHead(403, { "content-type": "text/html" }).end(PAGINA_DE_DESAFIO);
    } else {
      respuesta.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: "falso-1", status: "PENDING", uri: "https://payments.cosmospay.lat/falso-1", amount: "40.00" }));
    }
  } else {
    respuesta.writeHead(404).end();
  }
});
await new Promise((listo) => cosmos.listen(4010, "127.0.0.1", listo));

try {
  const stats = (await j("/api/stats")).datos;
  if (!stats?.pagos) throw new Error("El servidor no tiene pagos configurados (falta COSMOS_API_KEY en .env.local).");

  const vecina = await cuentaDePrueba(U, "vecina");
  const alta = await j("/api/pedidos", { titulo: "Prueba de pago frenado: cambiar una canilla", descripcion: "Gotea.", rubro: "plomeria", urgencia: "semana", zona: "Centro", clienteNombre: "Vecina Preparando", cuenta: vecina });
  const { id, clave } = alta.datos;
  const pr = (await j("/api/prestadores", { nombre: "Plomero Preparando", rubros: ["plomeria"], zonas: ["Centro"], cuenta: await cuentaDePrueba(U, "prestador"), billetera: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" })).datos.prestador;
  const oferta = (await j("/api/ofertas", { pedidoId: id, prestadorId: pr.id, precio: 60000, cuando: "Hoy", mensaje: "" })).datos.oferta;
  await j("/api/pedido/elegir", { id, clave, ofertaId: oferta.id, direccion: DIRECCION, turno: turnoPara("Hoy") });

  const frenado = await j("/api/pagos", { id, clave });
  ok("si Cosmos frena el pedido, responde que está preparando el pago (no un error)", frenado.estado === 202 && frenado.datos?.preparando === true && !frenado.datos?.error, `(${frenado.estado}) ${JSON.stringify(frenado.datos)}`);
  ok("antes de rendirse reintentó varias veces", desafios >= 3, `(${desafios} pedidos a Cosmos)`);
  ok("no quedó un pago a medias", (await j(`/api/pagos?id=${id}&clave=${clave}`)).datos?.pago === null);

  frenar = false;
  const armado = await j("/api/pagos", { id, clave });
  ok("cuando Cosmos vuelve a aceptar, arma el pago", armado.estado === 201 && armado.datos?.pago?.urlDePago === "https://payments.cosmospay.lat/falso-1", `(${armado.estado}) ${armado.datos?.error ?? ""}`);
  ok("y pedirlo de nuevo devuelve el mismo", (await j("/api/pagos", { id, clave })).datos?.pago?.urlDePago === armado.datos?.pago?.urlDePago);
} finally {
  cosmos.close();
}

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
