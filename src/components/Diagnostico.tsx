import { useId, useState, type ReactNode } from "react";
import { Estado, Icono } from "@/components/ui";
import type { Diagnostico as DatosDeDiagnostico } from "@/lib/tipos";

const RIESGO = { bajo: "riesgo bajo", medio: "riesgo medio", alto: "riesgo alto" } as const;

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-snug text-ink">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// Una fila de la tarjeta: ícono, título y resumen en una línea. Tocarla despliega el detalle.
function Fila({ icono, titulo, resumen, abierta, alTocar, children }: { icono: string; titulo: string; resumen: ReactNode; abierta: boolean; alTocar: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" onClick={alTocar} aria-expanded={abierta} aria-controls={id} className="flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left">
        <Icono nombre={icono} size={22} className="shrink-0 text-ink" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">{titulo}</span>
          <span className={`mt-0.5 block text-sm text-ink-500 ${abierta ? "" : "truncate"}`}>{resumen}</span>
        </span>
        <Icono nombre="abajo" size={20} className={`shrink-0 text-ink-500 transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>
      {abierta && (
        <div id={id} className="px-4 pb-4 pl-[52px]">
          {children}
        </div>
      )}
    </div>
  );
}

type Parte = "causa" | "pasos" | "materiales";

// Lo que la IA cree que pasa, si es peligroso y qué hacer ya. Siempre dicho como orientación.
// Una tarjeta con tres filas que se despliegan: Qué puede ser (con el riesgo), Qué hacer ya y Materiales.
// Con gas o electricidad, el aviso de matriculado queda siempre a la vista, arriba de la tarjeta.
// `para` cambia el tono: el vecino ve "qué hacer ya"; el prestador ve lo mismo para llegar preparado.
export function Diagnostico({ diagnostico, para = "vecino" }: { diagnostico: DatosDeDiagnostico; para?: "vecino" | "prestador" }) {
  const [abierta, setAbierta] = useState<Parte | null>(null);
  const alternar = (parte: Parte) => setAbierta((actual) => (actual === parte ? null : parte));
  const pasos = [...diagnostico.seguridad, ...diagnostico.queHacerYa];
  const riesgo = RIESGO[diagnostico.riesgo];
  const preguntas = para === "vecino" ? diagnostico.preguntas : [];

  return (
    <section aria-label="Diagnóstico orientativo" className="mt-6">
      {diagnostico.matriculado && (
        <p className="mb-3 flex items-start gap-2.5 rounded-2xl bg-subtle px-4 py-3 text-[15px] font-semibold leading-snug text-danger">
          <Icono nombre="alerta" size={20} className="mt-px shrink-0" />
          {para === "vecino" ? `Lo tiene que hacer un ${diagnostico.matriculado} matriculado.` : `Requiere ${diagnostico.matriculado} matriculado.`}
        </p>
      )}
      <div className="rounded-[18px] border border-line">
        {(diagnostico.causa || preguntas.length > 0) && (
          <Fila
            icono="alerta"
            titulo={para === "vecino" ? "Qué puede ser" : "Diagnóstico de la IA"}
            resumen={
              <>
                {diagnostico.causa ? `${diagnostico.causa} · ` : ""}
                <span className={diagnostico.riesgo === "alto" ? "font-semibold text-danger" : ""}>{riesgo}</span>
              </>
            }
            abierta={abierta === "causa"}
            alTocar={() => alternar("causa")}
          >
            <p className="mt-1">
              <Estado tono={diagnostico.riesgo === "alto" ? "mal" : "neutro"}>{riesgo.charAt(0).toUpperCase() + riesgo.slice(1)}</Estado>
            </p>
            {preguntas.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-sm font-semibold text-ink">Preguntale al prestador</p>
                <Lista items={preguntas} />
              </>
            )}
          </Fila>
        )}
        {pasos.length > 0 && (
          <Fila
            icono="check"
            titulo={para === "vecino" ? "Qué hacer ya" : "Qué le dijimos que haga"}
            resumen={`${pasos[0]}${pasos.length > 1 ? ` · ${pasos.length} pasos` : ""}`}
            abierta={abierta === "pasos"}
            alTocar={() => alternar("pasos")}
          >
            <Lista items={pasos} />
          </Fila>
        )}
        {diagnostico.materiales.length > 0 && (
          <Fila icono="lista" titulo="Materiales" resumen={diagnostico.materiales.join(", ")} abierta={abierta === "materiales"} alTocar={() => alternar("materiales")}>
            <Lista items={diagnostico.materiales} />
          </Fila>
        )}
      </div>
      <p className="mt-2 text-[13px] text-ink-500">Es una orientación de la IA, no reemplaza la visita de un profesional.</p>
    </section>
  );
}
