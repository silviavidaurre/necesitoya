// Borra SOLO lo que crearon las pruebas automáticas (cuentas con mail .test), usando el panel interno.
// Primero muestra qué hay; con --borrar, lo borra. Nunca toca datos reales.
// Uso: node pruebas/limpiar.mjs [url] [--borrar]
import { secretoLocal } from "./comun.mjs";

const U = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const borrar = process.argv.includes("--borrar");
const ADMIN = secretoLocal("ADMIN_SECRET");
if (!ADMIN) {
  console.log("Falta ADMIN_SECRET (en el entorno o en .env.local).");
  process.exit(1);
}
const pedir = async (ruta, cuerpo) => {
  const r = await fetch(U + ruta, { method: cuerpo ? "POST" : "GET", headers: { "content-type": "application/json", "x-admin": ADMIN }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return r.json();
};

console.log("Datos de prueba ahora:", JSON.stringify((await pedir("/api/admin?seccion=pruebas")).pruebas));
if (borrar) {
  console.log("Borrados:", JSON.stringify((await pedir("/api/admin", { accion: "limpiar-pruebas", confirmar: true })).borrados));
  console.log("Quedan:", JSON.stringify((await pedir("/api/admin?seccion=pruebas")).pruebas));
} else {
  console.log("Para borrarlos: agregá --borrar.");
}
