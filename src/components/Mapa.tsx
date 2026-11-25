import type { ReactNode } from "react";
import { MapaReal, useTokenDeMapa, type Punto } from "@/integraciones/mapbox-mapa/MapaReal";

// Mapa dibujado a mano (SVG propio): calles, un río, una plaza y el punto del trabajo. No es un mapa real ni usa
// servicios de mapas: sirve de fondo para ubicarse, como en las apps de viajes. Los colores salen de los tokens,
// así se ve claro del lado del vecino y oscuro del lado del prestador.
//
// - "inicio": el barrio con la ubicación del vecino y oficios cerca.
// - "destino": la casa (sin dirección escrita: la dirección es privada).
// - "ruta": el camino del prestador hasta la casa, con su marca. `progreso` (0 a 1) lo mueve sobre la ruta.

const RUTA: [number, number][] = [
  [40, 70],
  [40, 150],
  [130, 150],
  [130, 220],
  [220, 220],
  [220, 290],
  [300, 290],
];

// La ruta se achica a lo alto del mapa, para que la casa quede siempre a la vista (arriba del panel).
function rutaPara(alto: number): [number, number][] {
  const f = Math.max(0.3, (alto - 80) / 302);
  return RUTA.map(([x, y]) => [x, Math.round(y * f)]);
}

function puntoEnRuta(progreso: number, ruta: [number, number][]): [number, number] {
  const tramos = ruta.slice(1).map((p, i) => ({ desde: ruta[i], hasta: p, largo: Math.hypot(p[0] - ruta[i][0], p[1] - ruta[i][1]) }));
  const total = tramos.reduce((s, t) => s + t.largo, 0);
  let falta = Math.max(0, Math.min(1, progreso)) * total;
  for (const t of tramos) {
    if (falta <= t.largo) {
      const f = t.largo === 0 ? 0 : falta / t.largo;
      return [t.desde[0] + (t.hasta[0] - t.desde[0]) * f, t.desde[1] + (t.hasta[1] - t.desde[1]) * f];
    }
    falta -= t.largo;
  }
  return ruta[ruta.length - 1];
}

function Casa({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx="14" ry="5" fill="#000" fillOpacity="0.2" />
      <path d={`M${x} ${y}s-17-14-17-27a17 17 0 0 1 34 0c0 13-17 27-17 27z`} fill="var(--color-acento)" stroke="#0d0d0d" strokeWidth="2" />
      <path d={`M${x - 7} ${y - 26}l7-6 7 6v8h-14z`} fill="none" stroke="#0d0d0d" strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

// Con `real` (la pantalla de seguimiento) se usa el mapa real de Mapbox si está configurado; si no, el dibujado.
export function Mapa(props: Parameters<typeof MapaDibujado>[0] & { real?: { calle?: string; zona: string; punto?: Punto; prestador?: Punto | null; oscuro?: boolean } }) {
  const { real, ...resto } = props;
  if (!real) return <MapaDibujado {...resto} />;
  return <MapaConReal real={real} {...resto} />;
}

function MapaConReal({ real, ...resto }: Parameters<typeof MapaDibujado>[0] & { real: NonNullable<Parameters<typeof Mapa>[0]["real"]> }) {
  const token = useTokenDeMapa();
  if (!token) return <MapaDibujado {...resto} />;
  return (
    <MapaReal token={token} alto={resto.alto ?? 240} oscuro={real.oscuro} casa={{ calle: real.calle, zona: real.zona, punto: real.punto }} prestador={real.prestador} iniciales={resto.iniciales} respaldo={<MapaDibujado {...resto} />}>
      {resto.children}
    </MapaReal>
  );
}

function MapaDibujado({
  alto = 240,
  variante = "inicio",
  progreso = 0,
  iniciales = "",
  etiqueta,
  marcas = [],
  children,
}: {
  alto?: number;
  variante?: "inicio" | "destino" | "ruta";
  progreso?: number;
  iniciales?: string;
  // Texto chico del barrio (nunca la dirección).
  etiqueta?: string;
  // Globitos sobre el mapa, por ejemplo los precios de los presupuestos.
  marcas?: { texto: string; acento?: boolean }[];
  children?: ReactNode;
}) {
  const ruta = rutaPara(alto);
  const [px, py] = puntoEnRuta(progreso, ruta);
  const [cx, cy] = ruta[ruta.length - 1];
  const posiciones = [
    [70, 90],
    [262, 110],
    [205, 175],
  ];
  return (
    <div className="relative w-full overflow-hidden" style={{ height: alto, background: "var(--mapa-fondo)" }}>
      <svg width="100%" height={alto} viewBox={`0 0 390 ${alto}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0">
        <rect width="390" height={alto} fill="var(--mapa-fondo)" />
        <path d={`M-20 ${alto * 0.78} C 80 ${alto * 0.68}, 150 ${alto * 0.86}, 250 ${alto * 0.74} S 380 ${alto * 0.62}, 420 ${alto * 0.66}`} stroke="var(--mapa-rio)" strokeWidth="24" fill="none" />
        <g stroke="var(--mapa-calle)" strokeWidth="9" strokeLinecap="round" fill="none" transform={`rotate(${variante === "ruta" ? 0 : -14} 195 ${alto / 2})`}>
          <path d="M-80 30 H470 M-80 110 H470 M-80 190 H470 M-80 270 H470 M-80 350 H470" />
          <path d="M10 -80 V520 M100 -80 V520 M190 -80 V520 M280 -80 V520 M370 -80 V520" />
        </g>
        <rect x="236" y="40" width="96" height="62" rx="10" fill="var(--mapa-plaza)" />
        <path d={`M-20 ${alto * 0.62} L 420 ${alto * 0.12}`} stroke="var(--mapa-calle)" strokeWidth="18" strokeLinecap="round" />
        {etiqueta && (
          <text x="22" y={alto - 46} fill="var(--mapa-texto)" fontSize="10" fontWeight="700" letterSpacing="2" fontFamily="Inter, sans-serif">
            {etiqueta.toUpperCase()}
          </text>
        )}
        {variante === "inicio" && (
          <g>
            <circle cx="190" cy={alto * 0.52} r="34" fill="var(--color-acento)" fillOpacity="0.18" />
            <circle cx="190" cy={alto * 0.52} r="10" fill="#0d0d0d" stroke="#fff" strokeWidth="4" />
          </g>
        )}
        {variante === "destino" && <Casa x={195} y={alto * 0.62} />}
        {variante === "ruta" && (
          <g>
            <path d={`M${ruta.map((p) => p.join(" ")).join(" L")}`} stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Casa x={cx} y={cy + 12} />
            <circle cx={px} cy={py} r="26" fill="var(--color-acento)" fillOpacity="0.24" />
            <circle cx={px} cy={py} r="17" fill="#0d0d0d" stroke="#fff" strokeWidth="3" />
            {iniciales && (
              <text x={px} y={py + 5} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">
                {iniciales}
              </text>
            )}
          </g>
        )}
      </svg>
      {marcas.slice(0, 3).map((m, i) => (
        <span
          key={`${m.texto}-${i}`}
          className={`cifra absolute flex h-8 items-center rounded-full px-3 text-sm font-bold shadow-[0_4px_12px_rgba(0,0,0,0.18)] ${m.acento ? "bg-acento text-[#0d0d0d]" : "bg-[#0d0d0d] text-[#ffffff]"}`}
          style={{ left: posiciones[i][0], top: Math.min(posiciones[i][1], alto - 70) }}
        >
          {m.texto}
        </span>
      ))}
      {children && <div className="absolute inset-x-4 top-4 flex items-center justify-between">{children}</div>}
    </div>
  );
}

// La marca de NecesitoYa en una píldora negra, para poner arriba del mapa.
export function MarcaEnPildora() {
  return (
    <span className="cifra flex h-12 items-center rounded-full bg-[#0d0d0d] px-5 text-lg font-bold tracking-[-0.02em] text-[#ffffff] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
      Necesito<span className="text-acento">Ya</span>
    </span>
  );
}
