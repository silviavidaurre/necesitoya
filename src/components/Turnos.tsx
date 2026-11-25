import { FRANJAS, nombreDelDia, numeroDelDia, proximosDias, type Franja, type Turno } from "@/lib/turnos";

// Elegir días y franjas tocando, sin escribir. Días en tarjetas con el número grande; franjas debajo.

function TarjetaDeDia({ dia, activo, onClick }: { dia: string; activo: boolean; onClick: () => void }) {
  const nombre = nombreDelDia(dia);
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      aria-label={`${nombre} ${numeroDelDia(dia)}`}
      className={`flex h-[78px] flex-col items-center justify-center gap-0.5 rounded-2xl ${activo ? "bg-ink text-white" : "bg-subtle text-ink"}`}
    >
      <span className={`text-[13px] font-semibold ${activo ? "" : "text-ink-500"}`}>{nombre}</span>
      <span className="cifra text-[28px] font-bold leading-none">{numeroDelDia(dia)}</span>
    </button>
  );
}

function BotonDeFranja({ texto, activo, onClick }: { texto: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`cifra h-[52px] rounded-[14px] bg-white text-[17px] font-bold text-ink ${activo ? "border-2 border-ink" : "border border-line"}`}
    >
      {texto}
    </button>
  );
}

// El vecino elige UNO de los turnos que ofreció el prestador.
export function ElegirTurno({ turnos, valor, alCambiar }: { turnos: Turno[]; valor: Turno | null; alCambiar: (turno: Turno) => void }) {
  const dias = [...new Set(turnos.map((t) => t.dia))].slice(0, 8);
  const diaActivo = valor?.dia ?? dias[0];
  const franjasDelDia = turnos.filter((t) => t.dia === diaActivo);
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {dias.map((dia) => (
          <TarjetaDeDia
            key={dia}
            dia={dia}
            activo={dia === diaActivo}
            onClick={() => alCambiar(turnos.find((t) => t.dia === dia && t.franja === valor?.franja) ?? turnos.find((t) => t.dia === dia) ?? turnos[0])}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {franjasDelDia.map((t) => (
          <BotonDeFranja key={t.franja} texto={FRANJAS.find((f) => f.id === t.franja)?.texto ?? ""} activo={valor?.dia === t.dia && valor.franja === t.franja} onClick={() => alCambiar(t)} />
        ))}
      </div>
    </div>
  );
}

// El prestador ofrece VARIOS: los días en que puede y las franjas. Se combinan entre sí.
export function OfrecerTurnos({
  dias,
  franjas,
  alCambiarDias,
  alCambiarFranjas,
}: {
  dias: string[];
  franjas: Franja[];
  alCambiarDias: (dias: string[]) => void;
  alCambiarFranjas: (franjas: Franja[]) => void;
}) {
  const alternar = <T,>(lista: T[], valor: T) => (lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  return (
    <div>
      <div className="sin-barra -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {proximosDias().map((dia) => (
          <span key={dia} className="w-[72px] shrink-0">
            <TarjetaDeDia dia={dia} activo={dias.includes(dia)} onClick={() => alCambiarDias(alternar(dias, dia))} />
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {FRANJAS.map((f) => (
          <BotonDeFranja key={f.id} texto={f.texto} activo={franjas.includes(f.id)} onClick={() => alCambiarFranjas(alternar(franjas, f.id))} />
        ))}
      </div>
    </div>
  );
}

export function combinarTurnos(dias: string[], franjas: Franja[]): Turno[] {
  return dias.flatMap((dia) => franjas.map((franja) => ({ dia, franja })));
}
