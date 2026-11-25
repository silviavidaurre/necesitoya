import { BarraFlotante } from "@/components/BarraFlotante";

// Barra de abajo del prestador: Pedidos · Presupuestos · Perfil.
// `aviso` pone un punto en Presupuestos: hay mensajes de vecinos sin leer.
export function NavPrestador({ aviso = false }: { aviso?: boolean }) {
  return (
    <BarraFlotante
      etiqueta="Secciones del prestador"
      pestanas={[
        { href: "/prestador", nombre: "Pedidos", icono: "bandeja" },
        { href: "/prestador/ofertas", nombre: "Presupuestos", icono: "lista", aviso },
        { href: "/prestador/perfil", nombre: "Perfil", icono: "usuario" },
      ]}
    />
  );
}
