import { useEffect, useRef } from "react";
import { anotarCierre } from "@/lib/nativo";

// En la app de Android, el botón atrás del celular cierra esta pantalla (la que está encima de todo).
export function useCerrarConAtras(cerrar: () => void) {
  const actual = useRef(cerrar);
  actual.current = cerrar;
  useEffect(() => anotarCierre(() => actual.current()), []);
}
