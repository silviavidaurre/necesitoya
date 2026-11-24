import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { leerCuenta } from "@/lib/cliente";

// Con una cuenta de demostración, un cartelito arriba avisa que las personas y los pedidos son inventados.
export function AvisoDemo() {
  const { pathname } = useLocation();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(Boolean(leerCuenta()?.demo));
  }, [pathname]);
  if (!demo) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[max(2px,env(safe-area-inset-top))]">
      <p role="status" className="rounded-b-lg bg-acento px-2.5 text-[11px] font-bold leading-[18px] text-[#0d0d0d] shadow">
        Demo · todo inventado
      </p>
    </div>
  );
}
