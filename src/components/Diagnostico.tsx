import { Estado, Seccion } from "@/components/ui";
import type { Diagnostico as DatosDeDiagnostico } from "@/lib/tipos";

const RIESGO = { bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto" } as const;

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[15px] leading-snug text-ink">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lo que la IA cree que pasa, si es peligroso y qué hacer ya. Siempre dicho como orientación.
// `para` cambia el tono: el vecino ve "qué hacer ya"; el prestador ve lo mismo para llegar preparado.
export function Diagnostico({ diagnostico, para = "vecino" }: { diagnostico: DatosDeDiagnostico; para?: "vecino" | "prestador" }) {
  const pasos = [...diagnostico.seguridad, ...diagnostico.queHacerYa];
  return (
    <section aria-label="Diagnóstico orientativo">
      <Seccion>{para === "vecino" ? "Qué puede ser" : "Diagnóstico de la IA"}</Seccion>
      {diagnostico.causa && <p className="mt-2 text-base leading-snug text-ink">{diagnostico.causa}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <Estado tono={diagnostico.riesgo === "alto" ? "mal" : "neutro"}>{RIESGO[diagnostico.riesgo]}</Estado>
        {diagnostico.matriculado && <Estado tono="mal">Requiere {diagnostico.matriculado} matriculado</Estado>}
      </p>
      <Lista titulo={para === "vecino" ? "Qué hacer ya" : "Qué le dijimos que haga"} items={pasos} />
      <Lista titulo="Materiales que pueden hacer falta" items={diagnostico.materiales} />
      {para === "vecino" && <Lista titulo="Preguntale al prestador" items={diagnostico.preguntas} />}
      <p className="mt-4 text-[13px] text-ink-500">Es una orientación de la IA, no reemplaza la visita de un profesional.</p>
    </section>
  );
}
