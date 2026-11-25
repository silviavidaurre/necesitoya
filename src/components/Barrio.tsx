import { useState } from "react";
import { HojaDeAbajo, OpcionDeHoja } from "@/components/Hoja";
import { BotonPrimario, BotonTexto, ChipDesplegable, Icono, claseCampo } from "@/components/ui";
import { ZONAS, normalizar } from "@/lib/catalogo";

const esDeLaLista = (zona: string) => (ZONAS as readonly string[]).includes(zona);

// Elegir el barrio en una hoja de abajo: buscador, la lista de barrios de Jujuy y Palpalá, y "Otro barrio" para
// escribir uno que no está. Reemplaza al desplegable del navegador.
export function HojaBarrio({ valor, alElegir, alCerrar }: { valor: string; alElegir: (zona: string) => void; alCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  // null = mirando la lista; texto = escribiendo un barrio que no está en la lista.
  const [otro, setOtro] = useState<string | null>(valor && !esDeLaLista(valor) ? valor : null);
  const buscado = normalizar(busqueda.trim());
  const lista = ZONAS.filter((zona) => normalizar(zona).includes(buscado));
  const otroListo = (otro ?? "").trim().length >= 2;

  return (
    <HojaDeAbajo titulo="¿En qué barrio es?" alCerrar={alCerrar}>
      {otro === null ? (
        <>
          <label className="relative mt-1 block">
            <span className="sr-only">Buscar tu barrio</span>
            <Icono nombre="buscar" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              type="search"
              className={`${claseCampo} pl-12`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar barrio"
              maxLength={60}
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          <div className="mt-2">
            {lista.map((zona) => (
              <OpcionDeHoja key={zona} icono="pin" titulo={zona} elegida={zona === valor} onClick={() => alElegir(zona)} />
            ))}
            {lista.length === 0 && <p className="py-3 text-[15px] text-ink-500">No está en la lista. Elegí «Otro barrio» y escribilo.</p>}
            <OpcionDeHoja icono="mas" titulo="Otro barrio" detalle="Escribí el nombre" onClick={() => setOtro(busqueda.trim())} />
          </div>
        </>
      ) : (
        <form
          className="mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (otroListo) alElegir((otro ?? "").trim());
          }}
        >
          <label className="block">
            <span className="text-sm font-semibold text-ink-500">Nombre de tu barrio</span>
            <input className={`${claseCampo} mt-2`} value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={60} autoFocus autoComplete="off" />
          </label>
          <div className="mt-4">
            <BotonPrimario onClick={() => alElegir((otro ?? "").trim())} disabled={!otroListo}>
              Usar este barrio
            </BotonPrimario>
          </div>
          <BotonTexto onClick={() => setOtro(null)}>Volver a la lista</BotonTexto>
        </form>
      )}
    </HojaDeAbajo>
  );
}

// Chip del barrio con su ▾: muestra el elegido y abre la hoja para cambiarlo.
export function ChipBarrio({
  zona,
  alCambiar,
  variante = "relleno",
  sinElegir = "Elegí tu barrio",
}: {
  zona: string;
  alCambiar: (zona: string) => void;
  variante?: "relleno" | "borde" | "flotante";
  sinElegir?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <ChipDesplegable icono="pin" variante={variante} onClick={() => setAbierta(true)} etiqueta={zona ? `Barrio: ${zona}. Cambiar` : sinElegir}>
        {zona || sinElegir}
      </ChipDesplegable>
      {abierta && (
        <HojaBarrio
          valor={zona}
          alCerrar={() => setAbierta(false)}
          alElegir={(nueva) => {
            alCambiar(nueva);
            setAbierta(false);
          }}
        />
      )}
    </>
  );
}
