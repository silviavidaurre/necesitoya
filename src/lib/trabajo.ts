import type { EstadoDeTrabajo } from "./turnos";

// Una ubicación del prestador vale 10 minutos: si el celular dejó de mandarla, el vecino deja de verla.
export const UBICACION_VIGENTE_MS = 10 * 60_000;
import type { Oferta, Pedido, Trabajo } from "./tipos";

// Estado del trabajo de una oferta elegida. Las elegidas antes de que existieran los estados se leen como
// "confirmado" (o "terminado" si el prestador ya mandó la foto del después).
export function trabajoDe(oferta: Oferta): Trabajo | null {
  if (oferta.estado !== "elegida") return null;
  if (oferta.trabajo) {
    // La ubicación del prestador solo sale mientras va en camino y si es reciente (en la demo no vence).
    const { ubicacion, ...resto } = oferta.trabajo;
    const vigente = ubicacion && resto.estado === "en_camino" && (oferta.demo || Date.now() - Date.parse(ubicacion.creado) < UBICACION_VIGENTE_MS);
    return vigente ? { ...resto, ubicacion } : resto;
  }
  return { estado: oferta.terminado ? "terminado" : "confirmado", turno: null, historial: [] };
}

// El trabajo está activo mientras no terminó ni se canceló: solo entonces el prestador ve la dirección.
export function trabajoActivo(oferta: Oferta, pedido: Pedido | undefined) {
  const trabajo = trabajoDe(oferta);
  if (!trabajo || !pedido) return false;
  return pedido.estado === "cerrado" && !pedido.confirmado && !oferta.terminado && trabajo.estado !== "terminado";
}

// Borra la ubicación del prestador (al cancelar o cerrar el trabajo). Al cambiar de estado ya se borra sola.
export function olvidarUbicacion(oferta: Oferta | undefined) {
  if (oferta?.trabajo?.ubicacion) oferta.trabajo = { ...oferta.trabajo, ubicacion: undefined };
}

// Cada paso nuevo arranca sin ubicación: trabajoDe la saca, así que al llegar se deja de guardar dónde está.
export function pasarA(oferta: Oferta, estado: EstadoDeTrabajo) {
  const actual = trabajoDe(oferta) ?? { estado: "confirmado" as EstadoDeTrabajo, turno: null, historial: [] };
  oferta.trabajo = { ...actual, estado, historial: [...actual.historial, { estado, creado: new Date().toISOString() }].slice(-20) };
}
