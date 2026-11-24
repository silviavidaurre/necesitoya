// Corre todas las tandas de pruebas contra una URL y muestra un resumen.
// Uso: node scripts/pruebas.mjs [url]   (por defecto http://localhost:3000)
// Las tandas crean datos con cuentas .test: al final se borran con pruebas/limpiar.mjs (solo esos, nunca datos reales).
// En producción la app limita las cuentas nuevas por día y por conexión: correr todo varias veces el mismo día
// puede agotar el cupo de esa conexión (responde 429) hasta las 00:00 UTC.
import { spawnSync } from "node:child_process";

const U = process.argv[2] ?? "http://localhost:3000";
const TANDAS = ["circuito", "prestador", "muestra", "chat", "cuenta", "voz", "confianza", "avisos", "moderacion", "turnos", "eliminar", "correo", "demo"];

let fallas = 0;
for (const tanda of TANDAS) {
  const r = spawnSync(process.execPath, [`pruebas/${tanda}.mjs`, U], { encoding: "utf8" });
  const salida = `${r.stdout}${r.stderr}`;
  const bien = (salida.match(/^OK /gm) ?? []).length;
  const mal = (salida.match(/^FALLA/gm) ?? []).length + (r.status === 0 ? 0 : mal0(salida));
  fallas += mal;
  console.log(`${mal === 0 ? "OK   " : "FALLA"} ${tanda.padEnd(11)} ${bien} bien${mal ? `, ${mal} mal` : ""}`);
  for (const linea of salida.split("\n").filter((l) => l.startsWith("FALLA") || /^\w*Error/.test(l)).slice(0, 5)) console.log(`        ${linea}`);
}
// Si una tanda se cortó con un error (sin líneas FALLA), cuenta como una falla.
function mal0(salida) {
  return /^FALLA/m.test(salida) ? 0 : 1;
}

const limpieza = spawnSync(process.execPath, ["pruebas/limpiar.mjs", U, "--borrar"], { encoding: "utf8" });
console.log(`\nLimpieza de datos de prueba: ${(limpieza.stdout.trim().split("\n").pop() ?? "").trim()}`);
console.log(fallas === 0 ? "Todo bien." : `${fallas} comprobaciones fallaron.`);
process.exitCode = fallas === 0 ? 0 : 1;
