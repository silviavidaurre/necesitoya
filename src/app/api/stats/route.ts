import { cosmosDisponible } from "@/lib/cosmos";
import { esCuentaDePrueba, leer } from "@/lib/db";
import { iaDisponible } from "@/lib/ia";
import { vozDisponible } from "@/lib/voz";

// Números de uso real para el tablero de tracción.
// No cuentan: los pedidos de ejemplo, los prestadores de muestra, los presupuestos de muestra
// ni los pedidos donde el vecino pidió ver presupuestos de muestra.
export async function GET() {
  const db = await leer();
  // Tampoco cuenta lo creado por las cuentas de las pruebas automáticas (mails .test).
  const pedidosQueNoCuentan = new Set(db.pedidos.filter((p) => p.ejemplo || p.conMuestra || esCuentaDePrueba(p.cuenta)).map((p) => p.id));
  const prestadoresDePrueba = new Set(db.prestadores.filter((p) => p.ejemplo || esCuentaDePrueba(p.cuenta)).map((p) => p.id));
  const esDePrueba = (o: (typeof db.ofertas)[number]) => Boolean(o.ejemplo) || pedidosQueNoCuentan.has(o.pedidoId) || prestadoresDePrueba.has(o.prestadorId);

  return Response.json({
    prestadores: db.prestadores.filter((p) => !prestadoresDePrueba.has(p.id)).length,
    pedidos: db.pedidos.filter((p) => !pedidosQueNoCuentan.has(p.id)).length,
    ofertas: db.ofertas.filter((o) => !esDePrueba(o)).length,
    ofertasDePrueba: db.ofertas.filter(esDePrueba).length,
    ia: iaDisponible(),
    voz: vozDisponible(),
    pagos: cosmosDisponible(),
  });
}
