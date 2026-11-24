import { vozDisponible } from "@/lib/voz";

// Le dice a la app si hay voz en este servidor, para mostrar u ocultar el micrófono de respaldo y el botón Escuchar.
export async function GET() {
  return Response.json({ voz: vozDisponible() });
}
