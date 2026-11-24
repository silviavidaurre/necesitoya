import { Icono } from "@/components/ui";
import { Link, usePathname } from "@/lib/navegacion";

const PESTANAS = [
  { href: "/prestador", nombre: "Pedidos", icono: "bandeja" },
  { href: "/prestador/ofertas", nombre: "Mis presupuestos", icono: "lista" },
  { href: "/prestador/perfil", nombre: "Perfil", icono: "usuario" },
];

// Barra inferior del prestador: la sección activa va en negro con texto en negrita; el resto, gris.
// `aviso` pone un punto en Mis presupuestos: hay mensajes de vecinos sin leer.
export function NavPrestador({ aviso = false }: { aviso?: boolean }) {
  const ruta = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      {PESTANAS.map((p) => {
        const activa = ruta === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs ${activa ? "font-bold text-ink" : "font-medium text-ink-400"}`}
          >
            <span className="relative">
              <Icono nombre={p.icono} size={24} />
              {aviso && p.href === "/prestador/ofertas" && <span className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-white" aria-hidden="true" />}
            </span>
            {p.nombre}
            {aviso && p.href === "/prestador/ofertas" && <span className="sr-only">, hay mensajes nuevos</span>}
          </Link>
        );
      })}
    </nav>
  );
}
