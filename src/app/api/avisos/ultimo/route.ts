import { modificar } from "@/lib/db";
import { endpointValido } from "@/integraciones/webpush-avisos/push";

// El service worker del celular lo llama cuando lo despierta un push: devuelve el aviso más reciente sin entregar.
// Se entra con el endpoint de la suscripción, que solo conocen ese celular y el servidor.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const endpoint = cuerpo?.endpoint;
  if (!endpointValido(endpoint)) return Response.json({ aviso: null });

  const aviso = await modificar((db) => {
    const suscripcion = (db.suscripciones ?? []).find((s) => s.endpoint === endpoint);
    if (!suscripcion) return null;
    const propios = (db.avisos ?? []).filter((a) => a.cuenta === suscripcion.cuenta);
    const pendiente = [...propios].reverse().find((a) => !a.entregado) ?? propios[propios.length - 1];
    if (!pendiente) return null;
    pendiente.entregado = true;
    return pendiente;
  });

  return Response.json({ aviso: aviso ? { titulo: aviso.titulo, texto: aviso.texto, url: aviso.url, tipo: aviso.tipo } : null });
}
