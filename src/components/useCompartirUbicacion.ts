import { useEffect, useState } from "react";
import { useTokenDeMapa } from "@/integraciones/mapbox-mapa/MapaReal";
import { pedir } from "@/lib/cliente";

export type EstadoDeUbicacion = "apagado" | "compartiendo" | "sin-permiso" | "no-disponible";

const CADA_MS = 12_000;

// Mientras el prestador va en camino, el celular manda dónde está para que el vecino lo vea en el mapa.
// Solo si hay mapa real (Mapbox): sin mapa no tiene sentido mandarla. Se corta sola al llegar o al salir de la pantalla.
// Devuelve también el último punto, para que el prestador se vea en su propio mapa.
export function useCompartirUbicacion(enCamino: boolean, ofertaId: string, prestadorId: string | undefined): { estado: EstadoDeUbicacion; punto: { lat: number; lng: number } | null } {
  const token = useTokenDeMapa();
  const [estado, setEstado] = useState<EstadoDeUbicacion>("apagado");
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const activo = enCamino && Boolean(token) && Boolean(prestadorId);

  useEffect(() => {
    if (!activo) {
      setEstado("apagado");
      setPunto(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("no-disponible");
      return;
    }
    let ultima = 0;
    const id = navigator.geolocation.watchPosition(
      (posicion) => {
        setEstado("compartiendo");
        const { latitude: lat, longitude: lng, accuracy: precision } = posicion.coords;
        setPunto({ lat, lng });
        const ahora = Date.now();
        if (ahora - ultima < CADA_MS) return;
        ultima = ahora;
        // Si falla un envío no pasa nada: el siguiente lo reemplaza.
        void pedir("/api/ofertas/ubicacion", { method: "POST", body: JSON.stringify({ ofertaId, prestadorId, lat, lng, precision }) }).catch(() => undefined);
      },
      (error) => setEstado(error.code === error.PERMISSION_DENIED ? "sin-permiso" : "no-disponible"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo, ofertaId, prestadorId]);

  return { estado, punto };
}
