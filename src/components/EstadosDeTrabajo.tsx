import { ESTADOS_DE_TRABAJO, textoDeEstado, type EstadoDeTrabajo } from "@/lib/turnos";

// La barra de estados del trabajo: En camino, Llegó, Trabajando, Terminado. Lo hecho va en naranja.
// El prestador lo lee en primera persona ("Llegué").
export function BarraDeEstados({ estado, quien = "vecino" }: { estado: EstadoDeTrabajo; quien?: "vecino" | "prestador" }) {
  const pasos = ESTADOS_DE_TRABAJO.filter((e) => e.id !== "confirmado");
  const indice = pasos.findIndex((e) => e.id === estado);
  const texto = (id: EstadoDeTrabajo, base: string) => (quien === "prestador" && id === "llego" ? "Llegué" : base);
  return (
    <div role="img" aria-label={`Estado del trabajo: ${estado === "confirmado" ? "confirmado, todavía no salió" : textoDeEstado(estado)}`} className="grid grid-cols-4 gap-1.5">
      {pasos.map((paso, i) => (
        <span key={paso.id} className={`flex flex-col gap-1.5 text-xs ${i <= indice ? "font-bold text-ink" : "text-ink-500"}`}>
          <span className={`h-[5px] rounded-full ${i <= indice ? "bg-acento" : "bg-line"}`} />
          {texto(paso.id, paso.texto)}
        </span>
      ))}
    </div>
  );
}
