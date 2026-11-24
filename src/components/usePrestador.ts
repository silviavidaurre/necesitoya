import { useCallback, useEffect, useState } from "react";
import { ErrorDePedido, borrarPrestadorId, leerPrestadorId, pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";
import type { Prestador } from "@/lib/tipos";

// El perfil ya cargado se recuerda mientras la app esté abierta: al cambiar de pestaña no se vuelve a pedir
// (con mala señal eso dejaba una rueda en cada cambio) y se refresca en segundo plano.
let enMemoria: Prestador | null = null;

export function recordarPrestador(prestador: Prestador | null) {
  enMemoria = prestador;
}

// Carga el perfil guardado en este dispositivo.
// Con `obligatorio` (por defecto), si no hay ninguno manda al alta. Sin eso, la pantalla funciona también
// para quien todavía no se anotó: `prestador` queda en null y `anonimo` en true.
export function usePrestador({ obligatorio = true }: { obligatorio?: boolean } = {}) {
  const router = useRouter();
  const [prestador, setPrestador] = useState<Prestador | null>(enMemoria);
  const [cargando, setCargando] = useState(enMemoria === null);
  const [sinConexion, setSinConexion] = useState(false);
  const [anonimo, setAnonimo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    const id = leerPrestadorId();
    if (!id) {
      enMemoria = null;
      setPrestador(null);
      setAnonimo(true);
      setCargando(false);
      if (obligatorio) router.replace("/prestador/alta");
      return;
    }
    pedir<{ prestador: Prestador }>(`/api/prestadores?id=${encodeURIComponent(id)}`)
      .then((datos) => {
        enMemoria = datos.prestador;
        if (vigente) {
          setPrestador(datos.prestador);
          setSinConexion(false);
        }
      })
      .catch((error) => {
        // Solo se olvida el perfil si el servidor dice que no existe. Un corte de señal no le borra el perfil a nadie.
        if (error instanceof ErrorDePedido && error.estado === 404) {
          borrarPrestadorId();
          enMemoria = null;
          if (vigente) {
            setPrestador(null);
            setAnonimo(true);
          }
          if (obligatorio) router.replace("/prestador/alta");
        } else if (vigente && !enMemoria) {
          setSinConexion(true);
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [router, obligatorio, intento]);

  const reintentar = useCallback(() => {
    setSinConexion(false);
    setCargando(true);
    setIntento((n) => n + 1);
  }, []);

  return { prestador, cargando, sinConexion, anonimo, reintentar };
}
