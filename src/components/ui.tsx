import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/lib/navegacion";

// Piezas base de la interfaz (variante tipo Uber). Reglas que respetan:
// una acción principal grande por pantalla (negra en el lado claro, naranja en el oscuro), fija abajo y sin tapar nada;
// títulos de pocas palabras en Space Grotesk (grandes y a la izquierda en las listas, centrados en las hojas);
// números grandes; estados con punto y palabra; campos rellenos en gris, sin borde; selectores en chips con ▾;
// acciones secundarias en píldoras con ícono; hojas que suben sobre un mapa dibujado cuando la pantalla lo pide.

const TRAZOS: Record<string, ReactNode> = {
  atras: <path d="M19 12H5M11 6l-6 6 6 6" />,
  cerrar: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  abajo: <path d="m6 9 6 6 6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>
  ),
  // Parlante con ondas: escuchar. Cuadrado: cortar lo que suena.
  altavoz: <path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.500a5 5 0 0 1 0 7M18.700 5.300a9.500 9.500 0 0 1 0 13.400" />,
  detener: <rect x="6" y="6" width="12" height="12" rx="2" />,
  camara: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  bandeja: <path d="M4 13h4l2 3h4l2-3h4M5.5 5h13L22 13v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5L5.5 5Z" />,
  lista: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  usuario: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  enlace: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1-1" />,
  mensaje: <path d="M4 5h16v11H9l-5 4z" />,
  salir: <path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" />,
  estrella: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  compartir: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M7 8l5-5 5 5" />,
  editar: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  mas: <path d="M12 5v14M5 12h14" />,
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  escudo: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
  candado: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  casa: <path d="M3 11 12 4l9 7M5 10v10h14V10" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  ayuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" />
    </>
  ),
  tarjeta: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  campana: <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  recibo: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  repetir: <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />,
  calendario: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  alerta: <path d="M12 3 2 20h20zM12 10v4M12 17h.01" />,
  navegar: <path d="M3 11 21 3l-8 18-2-8z" />,
  // Oficios
  plomeria: <path d="M12 2.700s6 6.1 6 10.800a6 6 0 0 1-12 0C6 8.8 12 2.7 12 2.700Z" />,
  gas: <path d="M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.300 1.4 1 2.2 2 2.700C11.2 9 12 6.5 12 3Z" />,
  electricidad: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  albanileria: <path d="M3 4h18v16H3zM3 9.300h18M3 14.700h18M9 4v5.300M15 9.300v5.400M9 14.700V20" />,
  pintura: <path d="M4 3h13v6H4zM17 6h3v6h-8v3M10.5 15h3v6h-3z" />,
  carpinteria: <path d="M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  herreria: <path d="M4 21V8l8-4 8 4v13M8 21V10M12 21V8M16 21V10M4 14h16" />,
  aire: <path d="M12 2v20M4 7l16 10M20 7 4 17M9 4l3 2 3-2M9 20l3-2 3 2" />,
  electrodomesticos: (
    <>
      <path d="M5 3h14v18H5zM5 8h14M8 5.500h.01M11 5.500h.01" />
      <circle cx="12" cy="14.5" r="3.5" />
    </>
  ),
  jardineria: <path d="M5 19C5 11 10 6 20 5c0 9-4 15-12 15-1 0-2-.3-3-1ZM4 22c2-5 5-8 9-10" />,
  limpieza: <path d="m12 3 1.8 4.7 4.7 1.8-4.7 1.800L12 16l-1.8-4.7-4.7-1.8 4.7-1.800ZM18 15l.8 2.200L21 18l-2.2.800L18 21l-.8-2.200L15 18l2.2-.800Z" />,
  mudanzas: (
    <>
      <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="16.5" cy="17.5" r="2" />
    </>
  ),
  cerrajeria: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2M17 6l3 3M14 9l2 2" />
    </>
  ),
  otros: <path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" />,
};

export function Icono({ nombre, size = 22, className = "" }: { nombre: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {TRAZOS[nombre] ?? TRAZOS.otros}
    </svg>
  );
}

export function IconoCirculo({ nombre, size = 48 }: { nombre: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-subtle text-ink" style={{ width: size, height: size }}>
      <Icono nombre={nombre} size={Math.round(size * 0.46)} />
    </span>
  );
}

// Alto del pie fijo, medido: el contenido deja abajo ese espacio y el botón principal nunca tapa nada
// (aunque el pie crezca con un aviso, un error o la letra agrandada del celular).
function useAltoDelPie() {
  const [alto, setAlto] = useState(0);
  const observador = useRef<ResizeObserver | null>(null);
  const medir = useCallback((pie: HTMLDivElement | null) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!pie) {
      setAlto(0);
      return;
    }
    setAlto(pie.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    observador.current = new ResizeObserver(() => setAlto(pie.offsetHeight));
    observador.current.observe(pie);
  }, []);
  useEffect(() => () => observador.current?.disconnect(), []);
  return { alto, medir };
}

const clasePie = "fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3";

// Pantalla: contenido con margen de 20 px y, si hay, la acción principal fija abajo.
// Con `mapa`, el mapa va arriba a todo el ancho y el contenido sube encima como una hoja con manija.
// `conNav` deja lugar para la barra flotante de abajo.
export function Pantalla({ children, pie, conNav = false, mapa }: { children: ReactNode; pie?: ReactNode; conNav?: boolean; mapa?: ReactNode }) {
  const { alto, medir } = useAltoDelPie();
  // Mientras no se midió, se reserva lo de un botón con una línea de texto.
  const abajo = pie ? { paddingBottom: (alto || 112) + 24 } : undefined;
  const claseAbajo = pie ? "" : conNav ? "pb-32" : "pb-10";
  const elPie = pie && (
    <div ref={medir} className={clasePie}>
      {pie}
    </div>
  );
  if (mapa) {
    return (
      <>
        <main className={`flex flex-1 flex-col ${claseAbajo}`} style={abajo}>
          <div className="relative -mb-8">{mapa}</div>
          <div className="relative flex flex-1 flex-col rounded-t-[28px] bg-white px-5 pt-2.5" style={{ boxShadow: "var(--sombra-panel)" }}>
            <span className="mb-3 h-[5px] w-10 shrink-0 self-center rounded-full bg-line" aria-hidden="true" />
            {children}
          </div>
        </main>
        {elPie}
      </>
    );
  }
  return (
    <>
      <main className={`flex flex-1 flex-col px-5 ${claseAbajo}`} style={abajo}>
        {children}
      </main>
      {elPie}
    </>
  );
}

const sombraFlota = "shadow-[var(--sombra-flota)]";

// Botón redondo que flota sobre el mapa (volver, cuenta).
export function BotonFlotante({ icono, etiqueta, href, onClick }: { icono: string; etiqueta: string; href?: string; onClick?: () => void }) {
  const clase = `flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-flota text-ink ${sombraFlota} active:bg-subtle`;
  if (href) {
    return (
      <Link href={href} aria-label={etiqueta} className={clase}>
        <Icono nombre={icono} size={22} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={etiqueta} className={clase}>
      <Icono nombre={icono} size={22} />
    </button>
  );
}

// Píldora que flota sobre el mapa: el barrio, "Tengo un oficio", "En vivo". Con `href` u `onClick` es un botón.
export function PildoraFlotante({ children, href, onClick, etiqueta }: { children: ReactNode; href?: string; onClick?: () => void; etiqueta?: string }) {
  const clase = `flex h-12 min-w-0 items-center gap-2 rounded-full bg-flota px-4 text-[15px] font-bold text-ink ${sombraFlota}`;
  if (href) {
    return (
      <Link href={href} aria-label={etiqueta} className={`${clase} active:bg-subtle`}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={etiqueta} className={`${clase} active:bg-subtle`}>
        {children}
      </button>
    );
  }
  return <span className={clase}>{children}</span>;
}

// Cabecera de 60 px: la flecha (o la X) y, en las hojas de pantalla completa, el título centrado.
// Con `titulo` el título es el <h1> de la pantalla: toma el foco al abrir (lo anuncia el lector de pantalla).
export function Cabecera({
  volver,
  alVolver,
  cerrar = false,
  derecha,
  titulo,
}: {
  volver?: string;
  alVolver?: () => void;
  cerrar?: boolean;
  derecha?: ReactNode;
  titulo?: string;
}) {
  const icono = <Icono nombre={cerrar ? "cerrar" : "atras"} size={24} />;
  const clase = "relative z-[1] -ml-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-subtle text-ink active:bg-line";
  const encabezado = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!titulo) return;
    encabezado.current?.focus({ preventScroll: true });
    document.title = `${titulo} · NecesitoYa`;
  }, [titulo]);
  return (
    <header className="relative flex h-[60px] shrink-0 items-center justify-between">
      {titulo && (
        <h1 ref={encabezado} tabIndex={-1} className="absolute inset-x-14 truncate text-center text-[19px] font-bold text-ink outline-none">
          {titulo}
        </h1>
      )}
      {alVolver ? (
        <button type="button" onClick={alVolver} aria-label={cerrar ? "Cerrar" : "Volver"} className={clase}>
          {icono}
        </button>
      ) : volver ? (
        <Link href={volver} aria-label={cerrar ? "Cerrar" : "Volver"} className={clase}>
          {icono}
        </Link>
      ) : (
        <span />
      )}
      {derecha}
    </header>
  );
}

export function Titulo({ children, pregunta }: { children: ReactNode; pregunta?: ReactNode }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const texto = typeof children === "string" ? children : "";
  useEffect(() => {
    window.scrollTo(0, 0);
    titulo.current?.focus({ preventScroll: true });
    if (texto) document.title = `${texto} · NecesitoYa`;
  }, [texto]);
  return (
    <div>
      <h1 ref={titulo} tabIndex={-1} className="text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-ink outline-none">
        {children}
      </h1>
      {pregunta && <p className="mt-2 text-base leading-snug text-ink-500">{pregunta}</p>}
    </div>
  );
}

export function Seccion({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="mt-8 flex items-baseline justify-between">
      <h2 className="text-xl font-bold tracking-[-0.01em] text-ink">{children}</h2>
      {derecha && <span className="text-sm text-ink-500">{derecha}</span>}
    </div>
  );
}

function Girando() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" aria-hidden="true" />;
}

// Acción principal: una sola por pantalla.
export function BotonPrimario({
  children,
  onClick,
  disabled = false,
  cargando = false,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  cargando?: boolean;
  href?: string;
}) {
  // Mientras carga sigue azul y con su texto: gris con rueda blanca no se veía y el botón quedaba sin nombre.
  const clase = `flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl bg-brand px-6 text-[18px] font-bold text-white active:bg-brand-600 ${cargando ? "opacity-85" : "disabled:bg-subtle disabled:text-ink-400"}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={clase}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || cargando} aria-busy={cargando} className={clase}>
      {cargando && <Girando />}
      {children}
    </button>
  );
}

// Acción secundaria: gris tonal, nunca azul.
export function BotonSecundario({ children, onClick, disabled = false }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-subtle px-6 text-base font-bold text-ink active:bg-line disabled:text-ink-400"
    >
      {children}
    </button>
  );
}

export function BotonTexto({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mx-auto flex h-12 items-center px-4 text-[15px] font-semibold text-ink-500">
      {children}
    </button>
  );
}

// Campo de formulario: etiqueta arriba, ayuda o error pegados al campo.
export function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <label className="mt-6 block">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      <div className="mt-2">{children}</div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm font-medium text-danger">
          {error}
        </span>
      ) : (
        ayuda && <span className="mt-1.5 block text-[13px] text-ink-500">{ayuda}</span>
      )}
    </label>
  );
}

// Campo relleno: gris, sin borde. Al tocarlo se marca con un anillo de tinta (bien visible en claro y en oscuro).
export const claseCampo =
  "w-full rounded-2xl border-0 bg-subtle px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-ink";

// Chip para elegir tocando (uno o varios): el elegido va invertido, el resto relleno en gris.
export function Chip({ children, activo, onClick }: { children: ReactNode; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold ${activo ? "bg-ink text-white" : "bg-subtle text-ink active:bg-line"}`}
    >
      {children}
    </button>
  );
}

// Selector en chip: muestra lo elegido con su ícono y un ▾. Tocarlo abre una hoja de abajo con las opciones.
// `borde` es la variante de filtro (contorno, sin relleno); `flotante` va sobre el mapa.
export function ChipDesplegable({
  children,
  icono,
  onClick,
  etiqueta,
  variante = "relleno",
}: {
  children: ReactNode;
  icono?: string;
  onClick: () => void;
  // Nombre completo para el lector de pantalla, por ejemplo "Barrio: Centro. Cambiar".
  etiqueta?: string;
  variante?: "relleno" | "borde" | "flotante";
}) {
  const estilo =
    variante === "borde"
      ? "min-h-11 border border-line bg-transparent px-3.5 text-[15px] active:bg-subtle"
      : variante === "flotante"
        ? `min-h-12 bg-flota px-3.5 text-[15px] ${sombraFlota} active:bg-subtle`
        : "min-h-11 bg-subtle px-3 text-[15px] active:bg-line";
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={etiqueta} className={`inline-flex min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-full font-semibold text-ink ${estilo}`}>
      {icono && <Icono nombre={icono} size={17} className="shrink-0" />}
      <span className="truncate">{children}</span>
      <Icono nombre="abajo" size={15} className="shrink-0" />
    </button>
  );
}

// Acción secundaria en píldora con ícono ("Comprobante", "Pedir de nuevo", "Escuchar").
export function Pildora({
  children,
  icono,
  onClick,
  href,
  borde = false,
  disabled = false,
}: {
  children: ReactNode;
  icono?: string;
  onClick?: () => void;
  href?: string;
  borde?: boolean;
  disabled?: boolean;
}) {
  const clase = `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink disabled:opacity-60 ${borde ? "border border-line active:bg-subtle" : "bg-subtle active:bg-line"}`;
  const contenido = (
    <>
      {icono && <Icono nombre={icono} size={18} className="shrink-0" />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={clase}>
      {contenido}
    </button>
  );
}

export function Segmentado<T extends string>({ opciones, valor, alCambiar }: { opciones: { id: T; texto: string }[]; valor: T; alCambiar: (id: T) => void }) {
  return (
    <div className="flex rounded-2xl bg-subtle p-1">
      {opciones.map((opcion) => (
        <button
          key={opcion.id}
          type="button"
          aria-pressed={valor === opcion.id}
          onClick={() => alCambiar(opcion.id)}
          className={`min-h-12 flex-1 rounded-xl px-3 text-[15px] font-semibold ${valor === opcion.id ? "bg-white text-ink shadow-sm" : "text-ink-500"}`}
        >
          {opcion.texto}
        </button>
      ))}
    </div>
  );
}

// Estado neutro: un punto y una palabra. El color solo aparece si salió bien o hay un problema.
export function Estado({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "bien" | "mal" }) {
  const punto = tono === "bien" ? "bg-success" : tono === "mal" ? "bg-danger" : "bg-ink-400";
  const texto = tono === "bien" ? "text-success" : tono === "mal" ? "text-danger" : "text-ink-500";
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${texto}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${punto}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function ErrorDePantalla({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-4 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

export function Cargando() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4" role="status">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-acento" aria-hidden="true" />
      <span className="text-[15px] text-ink-500">Cargando</span>
    </main>
  );
}

// Fila de lista a todo el ancho: ícono, dos líneas y flecha. Sin tarjeta.
export function Fila({
  icono,
  titulo,
  detalle,
  derecha,
  href,
  onClick,
}: {
  icono?: ReactNode;
  titulo: ReactNode;
  detalle?: ReactNode;
  derecha?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      {icono}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-semibold leading-snug text-ink">{titulo}</span>
        {detalle && <span className="mt-0.5 block text-sm text-ink-500">{detalle}</span>}
      </span>
      {derecha ?? ((href || onClick) && <Icono nombre="chevron" size={20} className="shrink-0 text-ink-400" />)}
    </>
  );
  const clase = "flex min-h-[72px] w-full items-center gap-4 py-3";
  if (href) return <Link href={href} className={clase}>{contenido}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={clase}>{contenido}</button>;
  return <div className={clase}>{contenido}</div>;
}

// Dice qué falta para que el botón principal se habilite. Va arriba del botón, dentro del pie.
export function Falta({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-center text-[15px] font-medium text-ink-500" aria-live="polite">
      {children}
    </p>
  );
}

// Sin señal: una frase y un botón para reintentar, en vez de una rueda que no termina.
export function SinConexion({ alReintentar }: { alReintentar: () => void }) {
  return (
    <Pantalla pie={<BotonPrimario onClick={alReintentar}>Reintentar</BotonPrimario>}>
      <div className="mt-[60px]">
        <Titulo pregunta="No pudimos cargar tus datos. Probá cuando vuelva la señal.">Sin señal</Titulo>
      </div>
    </Pantalla>
  );
}
