import { variable } from "@/lib/config";

// Mapbox: el mapa real del seguimiento. El token es PÚBLICO (empieza con "pk."): lo usa el navegador para traer el
// mapa y ubicar la dirección. Se restringe por dirección web en la cuenta de Mapbox (ver docs/mapbox-pasos.md).
// Sin token, la app sigue con el mapa dibujado.

export function tokenDeMapa(): string | null {
  const token = variable("MAPBOX_TOKEN");
  return token && token.startsWith("pk.") ? token : null;
}

// Límites aproximados de la zona donde funciona la app (Jujuy, con margen): una ubicación de afuera se descarta.
export const ZONA_DE_TRABAJO = { latMin: -27, latMax: -21, lngMin: -67.5, lngMax: -63 };

export function ubicacionValida(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= ZONA_DE_TRABAJO.latMin &&
    lat <= ZONA_DE_TRABAJO.latMax &&
    lng >= ZONA_DE_TRABAJO.lngMin &&
    lng <= ZONA_DE_TRABAJO.lngMax
  );
}
