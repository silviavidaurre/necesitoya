// Avisos al celular (presupuesto nuevo, mensaje, te eligieron, pago). Se completan con los avisos web push.

export interface Aviso {
  tipo: "presupuesto" | "mensaje" | "elegido" | "pago" | "terminado" | "reclamo";
  titulo: string;
  texto: string;
  url: string;
}

export function avisar(_cuenta: string | undefined | null, _aviso: Aviso) {}
