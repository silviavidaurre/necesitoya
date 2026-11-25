// Días y franjas horarias: el prestador ofrece algunas al presupuestar y el vecino elige una al contratar.
// No importa nada del servidor: lo usan la app y la API.

export type Franja = "manana" | "tarde" | "noche";

export interface Turno {
  // Fecha en Jujuy, AAAA-MM-DD.
  dia: string;
  franja: Franja;
}

export const FRANJAS: { id: Franja; texto: string }[] = [
  { id: "manana", texto: "8–12 h" },
  { id: "tarde", texto: "13–17 h" },
  { id: "noche", texto: "18–21 h" },
];

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_PARA_OFRECER = 7;

// La fecha de hoy en Jujuy (UTC−3), sin depender del reloj del celular ni del servidor.
export function hoyEnJujuy(ahora = Date.now()) {
  return new Date(ahora - 3 * 3600_000).toISOString().slice(0, 10);
}

export function sumarDias(dia: string, cantidad: number) {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}

// Los próximos días que se pueden ofrecer, empezando por hoy.
export function proximosDias(ahora = Date.now()) {
  const hoy = hoyEnJujuy(ahora);
  return Array.from({ length: DIAS_PARA_OFRECER }, (_, i) => sumarDias(hoy, i));
}

export function nombreDelDia(dia: string, ahora = Date.now()) {
  const hoy = hoyEnJujuy(ahora);
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, 1)) return "Mañana";
  return DIAS_CORTOS[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}

export function numeroDelDia(dia: string) {
  return String(Number(dia.slice(8, 10)));
}

export function textoDeFranja(franja: Franja) {
  return FRANJAS.find((f) => f.id === franja)?.texto ?? "";
}

// "Hoy · 13–17 h", "Mié 26 · 8–12 h".
export function textoDeTurno(turno: Turno, ahora = Date.now()) {
  const nombre = nombreDelDia(turno.dia, ahora);
  const dia = nombre === "Hoy" || nombre === "Mañana" ? nombre : `${nombre} ${numeroDelDia(turno.dia)}`;
  return `${dia} · ${textoDeFranja(turno.franja)}`;
}

export function mismoTurno(a: Turno, b: Turno) {
  return a.dia === b.dia && a.franja === b.franja;
}

// Hora en que termina cada franja (hora de Jujuy).
export const FIN_DE_FRANJA: Record<Franja, number> = { manana: 12, tarde: 17, noche: 21 };

// Un turno sigue sirviendo si es de un día que viene, o de hoy y a su franja le queda más de una hora.
export function turnoVigente(turno: Turno, ahora = Date.now()) {
  const hoy = hoyEnJujuy(ahora);
  if (turno.dia > hoy) return true;
  if (turno.dia < hoy) return false;
  return new Date(ahora - 3 * 3600_000).getUTCHours() < FIN_DE_FRANJA[turno.franja] - 1;
}

// Deja solo turnos válidos: días de hoy a dos semanas, franjas conocidas, sin repetir, ordenados.
export function limpiarTurnos(valor: unknown, ahora = Date.now()): Turno[] {
  if (!Array.isArray(valor)) return [];
  const hoy = hoyEnJujuy(ahora);
  const tope = sumarDias(hoy, 14);
  const vistos = new Set<string>();
  const turnos: Turno[] = [];
  for (const crudo of valor.slice(0, 40)) {
    const t = crudo as Partial<Turno> | null;
    if (!t || typeof t.dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.dia) || t.dia < hoy || t.dia > tope) continue;
    if (!FRANJAS.some((f) => f.id === t.franja)) continue;
    const clave = `${t.dia}|${t.franja}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    turnos.push({ dia: t.dia, franja: t.franja as Franja });
  }
  return turnos.sort((a, b) => a.dia.localeCompare(b.dia) || FRANJAS.findIndex((f) => f.id === a.franja) - FRANJAS.findIndex((f) => f.id === b.franja)).slice(0, 21);
}

// Presupuestos de versiones viejas de la app (solo "Hoy", "Mañana"...): se traducen a turnos.
export function turnosDesdeCuando(cuando: string, ahora = Date.now()): Turno[] {
  const hoy = hoyEnJujuy(ahora);
  const texto = cuando.toLowerCase();
  if (texto.includes("coordinar")) return [];
  if (texto.startsWith("hoy")) return [{ dia: hoy, franja: "tarde" }, { dia: hoy, franja: "noche" }];
  if (texto.startsWith("mañana") || texto.startsWith("manana")) return [{ dia: sumarDias(hoy, 1), franja: "manana" }, { dia: sumarDias(hoy, 1), franja: "tarde" }];
  return [1, 2, 3].map((i) => ({ dia: sumarDias(hoy, i), franja: "tarde" as Franja }));
}

// Resumen en palabras de lo que ofrece: "Hoy y mañana", "Hoy · 13–17 h".
export function resumenDeTurnos(turnos: Turno[], ahora = Date.now()) {
  if (turnos.length === 0) return "A coordinar";
  if (turnos.length === 1) return textoDeTurno(turnos[0], ahora);
  const dias = [...new Set(turnos.map((t) => t.dia))].map((d) => nombreDelDia(d, ahora));
  return dias.length === 1 ? `${dias[0]}, ${turnos.length} horarios` : `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1].toLowerCase()}`;
}

// Estados del trabajo, en orden. El prestador los avanza con un botón; "terminado" lleva la foto del después.
export type EstadoDeTrabajo = "confirmado" | "en_camino" | "llego" | "trabajando" | "terminado";

export const ESTADOS_DE_TRABAJO: { id: EstadoDeTrabajo; texto: string; boton: string }[] = [
  { id: "confirmado", texto: "Confirmado", boton: "" },
  { id: "en_camino", texto: "En camino", boton: "Salgo para allá" },
  { id: "llego", texto: "Llegó", boton: "Llegué" },
  { id: "trabajando", texto: "Trabajando", boton: "Empecé el trabajo" },
  { id: "terminado", texto: "Terminado", boton: "Terminé" },
];

export function siguienteEstado(estado: EstadoDeTrabajo): EstadoDeTrabajo | null {
  const i = ESTADOS_DE_TRABAJO.findIndex((e) => e.id === estado);
  return i >= 0 && i < ESTADOS_DE_TRABAJO.length - 1 ? ESTADOS_DE_TRABAJO[i + 1].id : null;
}

export function textoDeEstado(estado: EstadoDeTrabajo) {
  return ESTADOS_DE_TRABAJO.find((e) => e.id === estado)?.texto ?? "";
}

// Reglas simples: se reprograma mientras está confirmado (antes de salir); se cancela antes de que llegue.
export function sePuedeReprogramar(estado: EstadoDeTrabajo) {
  return estado === "confirmado";
}

export function sePuedeCancelar(estado: EstadoDeTrabajo) {
  return estado === "confirmado" || estado === "en_camino";
}
