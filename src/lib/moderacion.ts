import type { BaseDeDatos, Pedido, Prestador } from "./tipos";

// Reglas de bloqueos y de la verificación que comparten varias rutas.

// true si el vecino de ese pedido y ese prestador no se tienen que cruzar más (cualquiera de los dos bloqueó al otro).
export function bloqueados(db: BaseDeDatos, pedido: Pick<Pedido, "cuenta"> | undefined, prestador: Pick<Prestador, "id" | "cuenta"> | undefined) {
  if (!pedido || !prestador) return false;
  const delVecino = pedido.cuenta ? db.cuentas?.find((c) => c.sub === pedido.cuenta) : undefined;
  const delPrestador = prestador.cuenta ? db.cuentas?.find((c) => c.sub === prestador.cuenta) : undefined;
  return Boolean(delVecino?.bloqueos?.includes(`p:${prestador.id}`) || (pedido.cuenta && delPrestador?.bloqueos?.includes(`c:${pedido.cuenta}`)));
}

// El nivel sale de lo aprobado a mano: 2 con el DNI verificado, 3 si además tiene la matrícula verificada.
export function nivelDe(db: BaseDeDatos, prestadorId: string): 1 | 2 | 3 {
  const aprobadas = (db.verificaciones ?? []).filter((v) => v.prestadorId === prestadorId && v.estado === "aprobada");
  const dni = aprobadas.some((v) => v.tipo === "dni");
  const matricula = aprobadas.some((v) => v.tipo === "matricula");
  return dni ? (matricula ? 3 : 2) : 1;
}

// Prefijo de las fotos privadas (DNI, selfie, matrícula, fotos de reclamos): /api/fotos no las sirve nunca.
export const PREFIJO_PRIVADO = "doc-";
