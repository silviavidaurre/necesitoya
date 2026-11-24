import { PLAZOS, eliminarCuenta } from "@/lib/bajas";
import { borrarFotos, cuentaDe, leer, modificar } from "@/lib/db";
import { esCuentaDemo } from "@/lib/demo";

// Eliminar la cuenta desde la app. Entra con la llave de la cuenta que guarda el celular y pide confirmar.
// Borra todo lo de la persona y anonimiza lo que hay que guardar (ver src/lib/bajas.ts). No se puede deshacer.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  if (cuerpo?.confirmar !== true) return Response.json({ error: "Falta confirmar que querés eliminar tu cuenta." }, { status: 400 });
  const sub = cuentaDe(await leer(), cuerpo?.cuenta);
  if (!sub) return Response.json({ error: "No encontramos tu cuenta. Entrá de nuevo y probá otra vez." }, { status: 401 });
  if (esCuentaDemo(await leer(), sub)) return Response.json({ error: "Es una cuenta de demostración: no se puede eliminar. Para probar la baja, creá tu propia cuenta." }, { status: 409 });

  const resultado = await modificar((db) => eliminarCuenta(db, sub));
  await borrarFotos(resultado.fotos).catch((error) => console.error("[baja] fotos", error));
  return Response.json({
    eliminada: resultado.existia,
    borrados: { ...resultado.borrados, fotos: resultado.fotos.length },
    anonimizados: resultado.anonimizados,
    plazos: PLAZOS,
  });
}
