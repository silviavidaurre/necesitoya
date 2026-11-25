import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as MapaDeMapbox, Marker } from "mapbox-gl";

// Mapa real del seguimiento, con Mapbox: la casa del vecino y, mientras va en camino, el prestador moviéndose.
// La dirección se ubica en el mapa desde el navegador (geocodificación de Mapbox) cada vez que se muestra: no se
// guarda convertida en coordenadas. Mapbox GL se carga recién acá, así el resto de la app no lo descarga.

export interface Punto {
  lat: number;
  lng: number;
}

// Centro aproximado de cada barrio: si no se encuentra la dirección, el mapa se centra ahí.
const CENTRO_DEL_BARRIO: Record<string, Punto> = {
  Centro: { lat: -24.1858, lng: -65.2995 },
  "Alto Comedero": { lat: -24.2386, lng: -65.2647 },
  "Los Perales": { lat: -24.2133, lng: -65.2723 },
  "Ciudad de Nieva": { lat: -24.1786, lng: -65.2844 },
  Cuyaya: { lat: -24.175, lng: -65.308 },
  "San Pedrito": { lat: -24.2, lng: -65.305 },
  Gorriti: { lat: -24.195, lng: -65.287 },
  "Mariano Moreno": { lat: -24.19, lng: -65.315 },
  Chijra: { lat: -24.165, lng: -65.3 },
  "Bajo La Viña": { lat: -24.18, lng: -65.32 },
  "Alto La Viña": { lat: -24.17, lng: -65.325 },
  "Los Huaicos": { lat: -24.175, lng: -65.34 },
  Malvinas: { lat: -24.245, lng: -65.255 },
  "Coronel Arias": { lat: -24.205, lng: -65.28 },
  Luján: { lat: -24.18, lng: -65.27 },
  Castañeda: { lat: -24.192, lng: -65.32 },
  "Sargento Cabral": { lat: -24.23, lng: -65.28 },
  "Almirante Brown": { lat: -24.198, lng: -65.275 },
  "Campo Verde": { lat: -24.21, lng: -65.31 },
  "Villa Jardín de Reyes": { lat: -24.16, lng: -65.37 },
  Yala: { lat: -24.12, lng: -65.4 },
  Palpalá: { lat: -24.256, lng: -65.211 },
};
const JUJUY = CENTRO_DEL_BARRIO.Centro;

// --- Token (público) ---------------------------------------------------------------------------------
let pedidoDeToken: Promise<string | null> | null = null;
function pedirToken() {
  pedidoDeToken ??= fetch("/api/mapa")
    .then((r) => r.json())
    .then((d: { token?: string | null }) => d.token ?? null)
    .catch(() => {
      pedidoDeToken = null;
      return null;
    });
  return pedidoDeToken;
}

// undefined mientras se pregunta; null = sin mapa real (se usa el dibujado).
export function useTokenDeMapa() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vigente = true;
    void pedirToken().then((t) => {
      if (vigente) setToken(t);
    });
    return () => {
      vigente = false;
    };
  }, []);
  return token;
}

// --- Dirección → punto en el mapa (en el navegador, sin guardar) ---------------------------------------
const ubicadas = new Map<string, Promise<Punto | null>>();
function ubicarDireccion(token: string, calle: string, zona: string): Promise<Punto | null> {
  const consulta = `${calle}, ${zona}, Jujuy, Argentina`;
  const yaEsta = ubicadas.get(consulta);
  if (yaEsta) return yaEsta;
  const cerca = CENTRO_DEL_BARRIO[zona] ?? JUJUY;
  const parametros = new URLSearchParams({ q: consulta, country: "ar", limit: "1", language: "es", proximity: `${cerca.lng},${cerca.lat}`, access_token: token });
  const promesa = fetch(`https://api.mapbox.com/search/geocode/v6/forward?${parametros.toString()}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { features?: { geometry?: { coordinates?: [number, number] } }[] } | null) => {
      const [lng, lat] = d?.features?.[0]?.geometry?.coordinates ?? [];
      // Si Mapbox devuelve algo lejos del barrio (más de ~15 km), no sirve: se usa el centro del barrio.
      if (typeof lat !== "number" || typeof lng !== "number" || Math.hypot(lat - cerca.lat, lng - cerca.lng) > 0.15) return null;
      return { lat, lng };
    })
    .catch(() => null);
  ubicadas.set(consulta, promesa);
  return promesa;
}

function marcaDeCasa() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<svg width="38" height="46" viewBox="-19 -40 38 46"><ellipse cx="0" cy="2" rx="12" ry="4" fill="#000" fill-opacity=".25"/><path d="M0 0s-17-14-17-27a17 17 0 0 1 34 0c0 13-17 27-17 27z" fill="#ff5a1f" stroke="#0d0d0d" stroke-width="2"/><path d="M-7 -26l7-6 7 6v8h-14z" fill="none" stroke="#0d0d0d" stroke-width="2" stroke-linejoin="round"/></svg>';
  return el;
}

function marcaDePrestador(iniciales: string) {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "width:38px;height:38px;border-radius:999px;background:#0d0d0d;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:700 12px Inter,sans-serif;box-shadow:0 0 0 8px rgba(255,90,31,.25)";
  el.textContent = iniciales;
  return el;
}

export function MapaReal({
  token,
  alto,
  oscuro = false,
  casa,
  prestador,
  iniciales = "",
  respaldo,
  children,
}: {
  token: string;
  // Lo que se muestra si el mapa real no carga (token inválido, sin conexión con Mapbox): el mapa dibujado.
  respaldo?: ReactNode;
  alto: number;
  oscuro?: boolean;
  // La casa: con un punto fijo (barrio demo) o con la dirección, que se ubica acá.
  casa: { calle?: string; zona: string; punto?: Punto };
  // Dónde está el prestador mientras va en camino (null si no comparte o ya llegó).
  prestador?: Punto | null;
  iniciales?: string;
  children?: ReactNode;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaDeMapbox | null>(null);
  const marcas = useRef<{ casa?: Marker; prestador?: Marker }>({});
  const [puntoCasa, setPuntoCasa] = useState<Punto | null>(casa.punto ?? null);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);

  // Ubicar la casa.
  useEffect(() => {
    if (casa.punto) return setPuntoCasa(casa.punto);
    let vigente = true;
    const centro = CENTRO_DEL_BARRIO[casa.zona] ?? JUJUY;
    if (!casa.calle) return setPuntoCasa(centro);
    void ubicarDireccion(token, casa.calle, casa.zona).then((p) => {
      if (vigente) setPuntoCasa(p ?? centro);
    });
    return () => {
      vigente = false;
    };
  }, [token, casa.calle, casa.zona, casa.punto?.lat, casa.punto?.lng]);

  // Crear el mapa una sola vez.
  useEffect(() => {
    let vigente = true;
    let creado: MapaDeMapbox | null = null;
    (async () => {
      try {
        const [{ default: mapboxgl }] = await Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]);
        if (!vigente || !contenedor.current) return;
        mapboxgl.accessToken = token;
        const centro = casa.punto ?? CENTRO_DEL_BARRIO[casa.zona] ?? JUJUY;
        creado = new mapboxgl.Map({
          container: contenedor.current,
          style: oscuro ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
          center: [centro.lng, centro.lat],
          zoom: 14,
          attributionControl: true,
          cooperativeGestures: true,
          language: "es",
        });
        creado.on("load", () => {
          if (vigente) setListo(true);
        });
        creado.on("error", () => {
          if (vigente && !creado?.loaded()) setFallo(true);
        });
        mapa.current = creado;
        marcas.current.casa = new mapboxgl.Marker({ element: marcaDeCasa(), anchor: "bottom" }).setLngLat([centro.lng, centro.lat]).addTo(creado);
        marcas.current.prestador = new mapboxgl.Marker({ element: marcaDePrestador(iniciales) });
      } catch {
        if (vigente) setFallo(true);
      }
    })();
    return () => {
      vigente = false;
      creado?.remove();
      mapa.current = null;
      marcas.current = {};
    };
    // El mapa se crea una vez: los cambios de casa y prestador se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, oscuro]);

  // Mover las marcas y encuadrar.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !puntoCasa) return;
    marcas.current.casa?.setLngLat([puntoCasa.lng, puntoCasa.lat]);
    if (prestador) {
      marcas.current.prestador?.setLngLat([prestador.lng, prestador.lat]).addTo(m);
      const oeste = Math.min(puntoCasa.lng, prestador.lng);
      const este = Math.max(puntoCasa.lng, prestador.lng);
      const sur = Math.min(puntoCasa.lat, prestador.lat);
      const norte = Math.max(puntoCasa.lat, prestador.lat);
      m.fitBounds(
        [
          [oeste, sur],
          [este, norte],
        ],
        { padding: { top: 76, bottom: 40, left: 50, right: 50 }, maxZoom: 16, duration: 800 },
      );
    } else {
      marcas.current.prestador?.remove();
      m.easeTo({ center: [puntoCasa.lng, puntoCasa.lat], zoom: 15, duration: 800 });
    }
  }, [listo, puntoCasa, prestador?.lat, prestador?.lng]);

  if (fallo && respaldo) return <>{respaldo}</>;
  return (
    <div className="relative w-full overflow-hidden" style={{ height: alto, background: "var(--mapa-fondo)" }}>
      <div ref={contenedor} className="absolute inset-0" aria-label={prestador ? "Mapa: dónde está el prestador y tu casa" : "Mapa: tu casa"} role="img" />
      {fallo && <p className="absolute inset-x-4 bottom-3 text-center text-[13px] text-ink-500">No pudimos cargar el mapa.</p>}
      {children && <div className="absolute inset-x-4 top-4 flex items-center justify-between">{children}</div>}
    </div>
  );
}
