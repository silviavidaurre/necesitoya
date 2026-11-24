import { esCuentaDePrueba } from "./db";
import { pagoDe } from "./pagos";
import type { BaseDeDatos, Pedido } from "./tipos";

// Métricas de uso real para el panel interno. Nunca cuentan lo de muestra (`ejemplo`), los pedidos donde el vecino
// pidió presupuestos de muestra, ni lo creado por las cuentas de las pruebas automáticas (mails .test).

const HORA = 60 * 60 * 1000;

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

export function pedidosReales(db: BaseDeDatos): Pedido[] {
  return db.pedidos.filter((p) => !p.ejemplo && !p.conMuestra && !esCuentaDePrueba(p.cuenta));
}

export function metricas(db: BaseDeDatos, ahora = Date.now()) {
  const prestadoresDePrueba = new Set(db.prestadores.filter((p) => p.ejemplo || esCuentaDePrueba(p.cuenta)).map((p) => p.id));
  const pedidos = pedidosReales(db);
  const ofertasReales = db.ofertas.filter((o) => !o.ejemplo && !prestadoresDePrueba.has(o.prestadorId));

  // Presupuesto en menos de una hora: sobre los pedidos que ya tuvieron una hora para recibirlo.
  const conHoraCumplida = pedidos.filter((p) => ahora - Date.parse(p.creado) >= HORA);
  const rapidos = conHoraCumplida.filter((p) =>
    ofertasReales.some((o) => o.pedidoId === p.id && Date.parse(o.creado) - Date.parse(p.creado) < HORA),
  );

  const elegidos = pedidos.filter((p) => ofertasReales.some((o) => o.pedidoId === p.id && o.estado === "elegida"));
  const pagados = elegidos.filter((p) => {
    const elegida = ofertasReales.find((o) => o.pedidoId === p.id && o.estado === "elegida");
    const pago = elegida ? pagoDe(db, elegida.id) : undefined;
    return Boolean(pago && pago.estado !== "pendiente" && pago.estado !== "cancelado" && pago.estado !== "vencido");
  });
  const terminados = pedidos.filter((p) => Boolean(p.confirmado));
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");

  // Gente que vuelve a pedir: cuentas con dos pedidos o más, sobre las cuentas que pidieron alguna vez.
  const porCuenta = new Map<string, number>();
  for (const p of pedidos) if (p.cuenta) porCuenta.set(p.cuenta, (porCuenta.get(p.cuenta) ?? 0) + 1);
  const vuelven = [...porCuenta.values()].filter((n) => n >= 2).length;

  // Pedidos por semana, las últimas 8 (la más reciente al final).
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const hasta = ahora - (7 - i) * 7 * 24 * HORA;
    const desde = hasta - 7 * 24 * HORA;
    return { desde: new Date(desde).toISOString().slice(0, 10), pedidos: pedidos.filter((p) => Date.parse(p.creado) >= desde && Date.parse(p.creado) < hasta).length };
  });

  return {
    pedidos: pedidos.length,
    prestadores: db.prestadores.filter((p) => !prestadoresDePrueba.has(p.id)).length,
    presupuestos: ofertasReales.filter((o) => pedidos.some((p) => p.id === o.pedidoId)).length,
    conPresupuestoEnMenosDeUnaHora: { cantidad: rapidos.length, sobre: conHoraCumplida.length, porcentaje: porcentaje(rapidos.length, conHoraCumplida.length) },
    elegidos: { cantidad: elegidos.length, sobre: pedidos.length, porcentaje: porcentaje(elegidos.length, pedidos.length) },
    pagadosPorLaApp: { cantidad: pagados.length, sobre: elegidos.length, porcentaje: porcentaje(pagados.length, elegidos.length) },
    terminados: { cantidad: terminados.length, sobre: elegidos.length, porcentaje: porcentaje(terminados.length, elegidos.length) },
    cancelados: cancelados.length,
    vuelvenAPedir: { cantidad: vuelven, sobre: porCuenta.size, porcentaje: porcentaje(vuelven, porCuenta.size) },
    semanas,
  };
}
