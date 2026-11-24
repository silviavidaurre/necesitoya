import { modificar, nuevoId } from "./db";
import { enviarFcm, fcmDisponible } from "./fcm";
import { despertar, pushDisponible } from "./push";
import { enSegundoPlano } from "./segundo-plano";
import type { AvisoGuardado } from "./tipos";

// Avisos al celular (presupuesto nuevo, mensaje, te eligieron, pago, trabajo terminado, reclamo).
// El aviso se guarda para la cuenta y después se despierta a cada celular suyo que aceptó avisos.
// Todo pasa en segundo plano: la respuesta a quien hizo la acción no espera a los avisos.

export interface Aviso {
  tipo: "presupuesto" | "mensaje" | "elegido" | "pago" | "terminado" | "reclamo";
  titulo: string;
  texto: string;
  url: string;
}

const AVISOS_POR_CUENTA = 20;
const AVISOS_EN_TOTAL = 3000;

export function avisar(cuenta: string | undefined | null, aviso: Aviso) {
  if (!cuenta || (!pushDisponible() && !fcmDisponible())) return;
  enSegundoPlano(mandar(cuenta, aviso));
}

async function mandar(cuenta: string, aviso: Aviso) {
  const endpoints = await modificar((db) => {
    const suscripciones = (db.suscripciones ?? []).filter((s) => s.cuenta === cuenta);
    if (suscripciones.length === 0) return [];
    const nuevo: AvisoGuardado = { id: nuevoId(), cuenta, ...aviso, creado: new Date().toISOString() };
    const propios = (db.avisos ?? []).filter((a) => a.cuenta === cuenta);
    const ajenos = (db.avisos ?? []).filter((a) => a.cuenta !== cuenta);
    // Se guardan los últimos de cada cuenta y un tope general, para que la base no crezca sin fin.
    db.avisos = [...ajenos, ...propios.slice(-(AVISOS_POR_CUENTA - 1)), nuevo].slice(-AVISOS_EN_TOTAL);
    return suscripciones.map((s) => s.endpoint);
  });
  if (endpoints.length === 0) return;
  // Celulares con la app de Android: aviso por Firebase, con el texto adentro. Navegadores: web push que despierta.
  const resultados = await Promise.all(
    endpoints.map(async (endpoint) => ({
      endpoint,
      estado: endpoint.startsWith("fcm:") ? await enviarFcm(endpoint.slice(4), aviso) : await despertar(endpoint),
    })),
  );
  const vencidas = new Set(resultados.filter((r) => r.estado === "vencida").map((r) => r.endpoint));
  if (vencidas.size > 0) {
    await modificar((db) => {
      db.suscripciones = (db.suscripciones ?? []).filter((s) => !vencidas.has(s.endpoint));
    });
  }
}
