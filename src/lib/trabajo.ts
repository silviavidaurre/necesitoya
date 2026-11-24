import type { EstadoDeTrabajo } from "./turnos";
import type { Oferta, Pedido, Trabajo } from "./tipos";

// Estado del trabajo de una oferta elegida. Las elegidas antes de que existieran los estados se leen como
// "confirmado" (o "terminado" si el prestador ya mandó la foto del después).
export function trabajoDe(oferta: Oferta): Trabajo | null {
  if (oferta.estado !== "elegida") return null;
  if (oferta.trabajo) return oferta.trabajo;
  return { estado: oferta.terminado ? "terminado" : "confirmado", turno: null, historial: [] };
}

// El trabajo está activo mientras no terminó ni se canceló: solo entonces el prestador ve la dirección.
export function trabajoActivo(oferta: Oferta, pedido: Pedido | undefined) {
  const trabajo = trabajoDe(oferta);
  if (!trabajo || !pedido) return false;
  return pedido.estado === "cerrado" && !pedido.confirmado && !oferta.terminado && trabajo.estado !== "terminado";
}

export function pasarA(oferta: Oferta, estado: EstadoDeTrabajo) {
  const actual = trabajoDe(oferta) ?? { estado: "confirmado" as EstadoDeTrabajo, turno: null, historial: [] };
  oferta.trabajo = { ...actual, estado, historial: [...actual.historial, { estado, creado: new Date().toISOString() }].slice(-20) };
}
