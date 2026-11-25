import { tokenDeMapa } from "@/integraciones/mapbox-mapa/mapbox";

// Le dice a la app si hay mapa real y con qué token público pedirlo. null = mapa dibujado.
export async function GET() {
  return Response.json({ token: tokenDeMapa() });
}
