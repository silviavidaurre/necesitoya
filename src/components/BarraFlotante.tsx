import { Icono } from "@/components/ui";
import { Link, usePathname } from "@/lib/navegacion";

export interface Pestana {
  href: string;
  nombre: string;
  icono: string;
  // Rutas que también cuentan como esta pestaña (por ejemplo, el detalle de un pedido dentro de "Mis pedidos").
  tambien?: string[];
  // Punto verde: hay algo nuevo ahí (mensajes sin leer).
  aviso?: boolean;
}

// Barra de abajo que flota: una píldora con borde y sombra, centrada. La pestaña activa lleva un fondo suave y
// el texto en negrita; el resto, gris. Las pantallas que la usan dejan lugar abajo con <Pantalla conNav>.
export function BarraFlotante({ pestanas, etiqueta }: { pestanas: Pestana[]; etiqueta: string }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label={etiqueta}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex gap-1 rounded-full border border-line bg-flota p-1.5 shadow-[var(--sombra-barra)]">
        {pestanas.map((p) => {
          const activa = ruta === p.href || (p.tambien ?? []).some((otra) => ruta.startsWith(otra));
          return (
            <Link
              key={p.href}
              href={p.href}
              aria-current={activa ? "page" : undefined}
              className={`flex min-h-14 w-[100px] flex-col items-center justify-center gap-0.5 rounded-full text-xs ${activa ? "bg-pestana font-bold text-ink" : "font-medium text-ink-500 active:bg-subtle"}`}
            >
              <span className="relative">
                <Icono nombre={p.icono} size={22} />
                {p.aviso && <span className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-flota" aria-hidden="true" />}
              </span>
              {p.nombre}
              {p.aviso && <span className="sr-only">, hay mensajes nuevos</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
