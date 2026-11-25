import { useEffect, useState } from "react";
import { useTokenDeMapa } from "@/integraciones/mapbox-mapa/MapaReal";
import { pedir } from "@/lib/cliente";

export type EstadoDeUbicacion = "apagado" | "compartiendo" | "sin-permiso" | "no-disponible";

const CADA_MS = 12_000;

// Mientras el prestador va en camino, el celular manda dónde está para que el vecino lo vea en el mapa.
// Solo si hay mapa real (Mapbox): sin mapa no tiene sentido mandarla. Se corta sola al llegar o al salir de la pantalla.
export function useCompartirUbicacion(enCamino: boolean, ofertaId: string, prestadorId: string | undefined): EstadoDeUbicacion {
  const token = useTokenDeMapa();
  const [estado, setEstado] = useState<EstadoDeUbicacion>("apagado");
  const activo = enCamino && Boolean(token) && Boolean(prestadorId);

  useEffect(() => {
    if (!activo) {
      setEstado("apagado");
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
        const ahora = Date.now();
        if (ahora - ultima < CADA_MS) return;
        ultima = ahora;
        const { latitude: lat, longitude: lng, accuracy: precision } = posicion.coords;
        // Si falla un envío no pasa nada: el siguiente lo reemplaza.
        void pedir("/api/ofertas/ubicacion", { method: "POST", body: JSON.stringify({ ofertaId, prestadorId, lat, lng, precision }) }).catch(() => undefined);
      },
      (error) => setEstado(error.code === error.PERMISSION_DENIED ? "sin-permiso" : "no-disponible"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo, ofertaId, prestadorId]);

  return estado;
}
