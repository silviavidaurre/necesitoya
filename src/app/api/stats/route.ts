import { cosmosDisponible } from "@/lib/cosmos";
import { mercadoPagoDisponible } from "@/lib/mercadopago";
import { esCuentaDePrueba, leer } from "@/lib/db";
import { cuentasDeRevision } from "@/lib/revision";
import { iaDisponible } from "@/lib/ia";
import { vozDisponible } from "@/lib/voz";

// Números de uso real para el tablero de tracción.
// No cuentan: los pedidos de ejemplo, los prestadores de muestra, los presupuestos de muestra
// ni los pedidos donde el vecino pidió ver presupuestos de muestra.
export async function GET() {
  const db = await leer();
  // Tampoco cuenta lo creado por las cuentas de las pruebas automáticas (mails .test).
  // Ni las cuentas de la revisión de Google Play.
  const revision = cuentasDeRevision(db);
  const deRevision = (cuenta: string | undefined) => Boolean(cuenta && revision.has(cuenta));
  // Ni el barrio de demostración (`demo`).
  const pedidosQueNoCuentan = new Set(db.pedidos.filter((p) => p.ejemplo || p.demo || p.conMuestra || p.dePrueba || esCuentaDePrueba(p.cuenta) || deRevision(p.cuenta)).map((p) => p.id));
  const prestadoresDePrueba = new Set(db.prestadores.filter((p) => p.ejemplo || p.demo || esCuentaDePrueba(p.cuenta) || deRevision(p.cuenta)).map((p) => p.id));
  const esDePrueba = (o: (typeof db.ofertas)[number]) => Boolean(o.ejemplo) || Boolean(o.demo) || pedidosQueNoCuentan.has(o.pedidoId) || prestadoresDePrueba.has(o.prestadorId);

  return Response.json({
    prestadores: db.prestadores.filter((p) => !prestadoresDePrueba.has(p.id)).length,
    pedidos: db.pedidos.filter((p) => !pedidosQueNoCuentan.has(p.id)).length,
    ofertas: db.ofertas.filter((o) => !esDePrueba(o)).length,
    ofertasDePrueba: db.ofertas.filter(esDePrueba).length,
    ia: iaDisponible(),
    voz: vozDisponible(),
    pagos: cosmosDisponible() || mercadoPagoDisponible(),
    cosmos: cosmosDisponible(),
    mercadopago: mercadoPagoDisponible(),
  });
}
