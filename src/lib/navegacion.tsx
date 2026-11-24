import { useMemo } from "react";
import { Link as EnlaceRouter, useLocation, useNavigate, type LinkProps } from "react-router-dom";

// Capa fina sobre react-router para que las pantallas naveguen con una interfaz simple.

export function useRouter() {
  const navegar = useNavigate();
  return useMemo(
    () => ({
      push: (ruta: string) => navegar(ruta),
      replace: (ruta: string) => navegar(ruta, { replace: true }),
    }),
    [navegar],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function Link({ href, ...resto }: Omit<LinkProps, "to"> & { href: string }) {
  return <EnlaceRouter to={href} {...resto} />;
}
