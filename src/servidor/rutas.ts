import * as chat from "@/app/api/chat/route";
import * as cuenta from "@/app/api/cuenta/route";
import * as fotos from "@/app/api/fotos/route";
import * as pedidoIa from "@/app/api/ia/pedido/route";
import * as perfilIa from "@/app/api/ia/perfil/route";
import * as ofertas from "@/app/api/ofertas/route";
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
  "/api/chat": chat,
  "/api/cuenta": cuenta,
  "/api/fotos": fotos,
  "/api/ia/pedido": pedidoIa,
  "/api/ia/perfil": perfilIa,
  "/api/ofertas": ofertas,
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
