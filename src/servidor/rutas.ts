import * as admin from "@/app/api/admin/route";
import * as documento from "@/app/api/admin/documento/route";
import * as avisos from "@/app/api/avisos/route";
import * as bloqueos from "@/app/api/bloqueos/route";
import * as denuncias from "@/app/api/denuncias/route";
import * as dia from "@/app/api/ofertas/dia/route";
import * as cancelar from "@/app/api/pedido/cancelar/route";
import * as reclamos from "@/app/api/reclamos/route";
import * as verificacion from "@/app/api/verificacion/route";
import * as ultimoAviso from "@/app/api/avisos/ultimo/route";
import * as chat from "@/app/api/chat/route";
import * as cuenta from "@/app/api/cuenta/route";
import * as fotos from "@/app/api/fotos/route";
import * as pedidoIa from "@/app/api/ia/pedido/route";
import * as perfilIa from "@/app/api/ia/perfil/route";
import * as conectarMercadoPago from "@/app/api/mercadopago/conectar/route";
import * as vueltaDeMercadoPago from "@/app/api/mercadopago/vuelta/route";
import * as webhookDeMercadoPago from "@/app/api/mercadopago/webhook/route";
import * as ofertas from "@/app/api/ofertas/route";
import * as terminar from "@/app/api/ofertas/terminar/route";
import * as pagos from "@/app/api/pagos/route";
import * as webhookDePagos from "@/app/api/pagos/webhook/route";
import * as confirmar from "@/app/api/pedido/confirmar/route";
import * as calificar from "@/app/api/pedido/calificar/route";
import * as elegir from "@/app/api/pedido/elegir/route";
import * as muestra from "@/app/api/pedido/muestra/route";
import * as pedido from "@/app/api/pedido/route";
import * as pedidos from "@/app/api/pedidos/route";
import * as perfil from "@/app/api/perfil/route";
import * as fotosDePrestador from "@/app/api/prestadores/fotos/route";
import * as prestadores from "@/app/api/prestadores/route";
import * as stats from "@/app/api/stats/route";
import * as vozDecir from "@/app/api/voz/decir/route";
import * as voz from "@/app/api/voz/route";
import * as vozTranscribir from "@/app/api/voz/transcribir/route";

type Manejador = (peticion: Request) => Promise<Response>;
type Ruta = { GET?: Manejador; POST?: Manejador };

const RUTAS: Record<string, Ruta> = {
  "/api/admin": admin,
  "/api/admin/documento": documento,
  "/api/avisos": avisos,
  "/api/bloqueos": bloqueos,
  "/api/denuncias": denuncias,
  "/api/ofertas/dia": dia,
  "/api/pedido/cancelar": cancelar,
  "/api/reclamos": reclamos,
  "/api/verificacion": verificacion,
  "/api/avisos/ultimo": ultimoAviso,
  "/api/chat": chat,
  "/api/cuenta": cuenta,
  "/api/fotos": fotos,
  "/api/ia/pedido": pedidoIa,
  "/api/ia/perfil": perfilIa,
  "/api/mercadopago/conectar": conectarMercadoPago,
  "/api/mercadopago/vuelta": vueltaDeMercadoPago,
  "/api/mercadopago/webhook": webhookDeMercadoPago,
  "/api/ofertas": ofertas,
  "/api/ofertas/terminar": terminar,
  "/api/pagos": pagos,
  "/api/pagos/webhook": webhookDePagos,
  "/api/pedido/confirmar": confirmar,
  "/api/pedido": pedido,
  "/api/pedido/calificar": calificar,
  "/api/pedido/elegir": elegir,
  "/api/pedido/muestra": muestra,
  "/api/pedidos": pedidos,
  "/api/perfil": perfil,
  "/api/prestadores": prestadores,
  "/api/prestadores/fotos": fotosDePrestador,
  "/api/stats": stats,
  "/api/voz": voz,
  "/api/voz/decir": vozDecir,
  "/api/voz/transcribir": vozTranscribir,
};

// Punto de entrada único de la API: busca la ruta y el método. Devuelve JSON, salvo las fotos y el audio de la voz.
export async function atender(peticion: Request): Promise<Response> {
  const camino = new URL(peticion.url).pathname.replace(/\/+$/, "");
  const ruta = RUTAS[camino];
  if (!ruta) return Response.json({ error: "No existe esa ruta." }, { status: 404 });

  const manejador = peticion.method === "POST" ? ruta.POST : peticion.method === "GET" ? ruta.GET : undefined;
  if (!manejador) return Response.json({ error: "Método no permitido." }, { status: 405 });

  return manejador(peticion);
}
