import { useState } from "react";
import { recordarPrestador } from "@/components/usePrestador";
import { BotonPrimario, BotonTexto, Cabecera, ErrorDePantalla, Icono } from "@/components/ui";
import { borrarPrestadorId, guardarCuenta, leerCuenta, pedir, reemplazarMisPedidos } from "@/lib/cliente";
import { useCerrarConAtras } from "@/components/useAtras";
import { Link } from "@/lib/navegacion";

// Qué se borra y qué se guarda al eliminar la cuenta. Lo mismo dice la página pública /eliminar-cuenta.
export const SE_BORRA = [
  "Tu cuenta: mail y contraseña (o el acceso con Google).",
  "Tu perfil de prestador, tus fotos, tu billetera y tu celular.",
  "Las fotos de tu DNI, tu selfie y tu matrícula, si te verificaste.",
  "Tus pedidos, con su foto y la dirección.",
  "Los presupuestos y los mensajes de tus conversaciones.",
  "Los avisos y los celulares anotados para recibirlos.",
];

export const SE_GUARDA = [
  "Los registros de pagos ya hechos por la app, sin tus datos, hasta 10 años (obligaciones contables y prevención de fraude).",
  "Los reclamos abiertos, sin tus datos, hasta que se resuelvan y 1 año más.",
  "Las copias de seguridad se renuevan: lo borrado desaparece de ellas en hasta 30 días.",
];

export function Lista({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-snug text-ink">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// Eliminar la cuenta desde la app: dice qué se borra y qué se guarda, y pide confirmar. No se puede deshacer.
export function PantallaEliminarCuenta({ alCerrar }: { alCerrar: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [lista, setLista] = useState(false);
  useCerrarConAtras(() => (lista ? window.location.assign("/") : alCerrar()));
  const marco = "fixed inset-0 z-40 mx-auto flex w-full max-w-md flex-col bg-white";

  async function eliminar() {
    setEnviando(true);
    setError("");
    try {
      await pedir("/api/cuenta/eliminar", { method: "POST", body: JSON.stringify({ cuenta: leerCuenta()?.clave, confirmar: true }) });
      // El celular queda limpio: sin cuenta, sin perfil y sin pedidos guardados.
      guardarCuenta(null);
      borrarPrestadorId();
      recordarPrestador(null);
      reemplazarMisPedidos([]);
      setLista(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminar tu cuenta. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (lista) {
    return (
      <div className={marco} role="dialog" aria-modal="true" aria-label="Cuenta eliminada">
        <div className="flex flex-1 flex-col px-5">
          <div className="mt-[72px] flex flex-col items-center text-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-success">
              <Icono nombre="check" size={36} />
            </span>
            <h1 className="mt-4 text-[28px] font-bold leading-tight text-ink">Cuenta eliminada</h1>
            <p className="mt-2 text-base text-ink-500">Borramos tus datos. Gracias por haber usado NecesitoYa.</p>
          </div>
        </div>
        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <BotonPrimario onClick={() => window.location.assign("/")}>Ir al inicio</BotonPrimario>
        </div>
      </div>
    );
  }

  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Eliminar mi cuenta">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={alCerrar} cerrar />
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Eliminar tu cuenta?</h1>
        <p className="mt-2 text-base text-ink-500">No se puede deshacer.</p>
        <p className="mt-6 text-sm font-bold text-ink">Se borra</p>
        <Lista items={SE_BORRA} />
        <p className="mt-6 text-sm font-bold text-ink">Se guarda, sin tus datos</p>
        <Lista items={SE_GUARDA} />
        <p className="mt-6 text-[15px] text-ink-500">
          Más detalles en{" "}
          <Link href="/privacidad" className="font-semibold text-brand">
            privacidad
          </Link>
          .
        </p>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </div>
      <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <BotonPrimario onClick={eliminar} cargando={enviando}>
          Sí, eliminar mi cuenta
        </BotonPrimario>
        <BotonTexto onClick={alCerrar}>No, volver</BotonTexto>
      </div>
    </div>
  );
}
