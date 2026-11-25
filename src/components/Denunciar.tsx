import { useState } from "react";
import { BotonPrimario, Cabecera, Chip, ErrorDePantalla, Icono, claseCampo } from "@/components/ui";
import { useCerrarConAtras } from "@/components/useAtras";
import { leerCuenta, pedir } from "@/lib/cliente";
import { MOTIVOS_DE_DENUNCIA } from "@/lib/motivos";

// Denunciar un perfil o un mensaje, y (en el chat) bloquear a la otra persona. A pantalla completa, un solo botón.
// `bloquear` trae lo necesario para bloquear desde una conversación; sin eso, solo se denuncia.
export function Denunciar({
  tipo,
  objetivo,
  nombre,
  bloquear,
  alCerrar,
}: {
  tipo: "perfil" | "mensaje";
  // Perfil: el id público · mensaje: el id del último mensaje del otro. null = no hay nada para denunciar, solo bloquear.
  objetivo: string | null;
  nombre: string;
  bloquear?: Record<string, string> & { ofertaId: string };
  alCerrar: (resultado?: { bloqueado: boolean }) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [conBloqueo, setConBloqueo] = useState(Boolean(bloquear));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  useCerrarConAtras(() => alCerrar(listo ? { bloqueado: conBloqueo && Boolean(bloquear) } : undefined));
  const soloBloqueo = !objetivo;
  const cuenta = leerCuenta();

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      if (objetivo && motivo) {
        await pedir("/api/denuncias", { method: "POST", body: JSON.stringify({ tipo, objetivo, motivo, detalle, cuenta: cuenta?.clave }) });
      }
      if (bloquear && conBloqueo) {
        await pedir("/api/bloqueos", { method: "POST", body: JSON.stringify({ ...bloquear, cuenta: cuenta?.clave }) });
      }
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviarlo. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const marco = "fixed inset-0 z-40 mx-auto flex w-full max-w-md flex-col bg-white";

  if (listo) {
    return (
      <div className={marco} role="dialog" aria-modal="true" aria-label="Listo">
        <div className="flex flex-1 flex-col px-5">
          <Cabecera alVolver={() => alCerrar({ bloqueado: conBloqueo && Boolean(bloquear) })} cerrar />
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-success">
              <Icono nombre="check" size={36} />
            </span>
            <h1 className="mt-4 text-[28px] font-bold leading-tight text-ink">{motivo ? "Recibimos tu denuncia" : "Bloqueado"}</h1>
            <p className="mt-2 text-[17px] text-ink-500">
              {motivo ? "La revisamos a mano. " : ""}
              {conBloqueo && bloquear ? `No vas a ver más a ${nombre} y no te puede escribir.` : ""}
            </p>
          </div>
        </div>
        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <BotonPrimario onClick={() => alCerrar({ bloqueado: conBloqueo && Boolean(bloquear) })}>Listo</BotonPrimario>
        </div>
      </div>
    );
  }

  const falta = !cuenta ? "Entrá con tu cuenta para denunciar" : !soloBloqueo && !motivo && !conBloqueo ? "Elegí un motivo" : "";
  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Denunciar">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={() => alCerrar()} cerrar />
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">{soloBloqueo ? `¿Bloquear a ${nombre}?` : tipo === "perfil" ? "Denunciar este perfil" : `Denunciar a ${nombre}`}</h1>
        {!soloBloqueo && (
          <>
            <p className="mt-2 text-[17px] text-ink-500">{tipo === "mensaje" ? "Mandamos su último mensaje y la conversación al equipo." : "Lo revisamos a mano."}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {MOTIVOS_DE_DENUNCIA.map((m) => (
                <Chip key={m} activo={motivo === m} onClick={() => setMotivo(motivo === m ? "" : m)}>
                  {m}
                </Chip>
              ))}
            </div>
            <label className="mt-6 block">
              <span className="text-sm font-semibold text-ink">Contanos qué pasó</span>
              <textarea className={`${claseCampo} mt-2 min-h-24 resize-none`} value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={600} placeholder="Opcional." />
            </label>
          </>
        )}
        {bloquear && (
          <label className="mt-6 flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={conBloqueo} onChange={(e) => setConBloqueo(e.target.checked)} className="h-6 w-6 accent-[var(--color-brand)]" />
            <span className="text-base text-ink">Bloquear a {nombre}: no lo ves más y no te puede escribir</span>
          </label>
        )}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </div>
      <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {falta && <p className="mb-2 text-center text-[15px] font-medium text-ink-500">{falta}</p>}
        <BotonPrimario onClick={enviar} disabled={Boolean(falta) || (!motivo && !conBloqueo)} cargando={enviando}>
          {motivo || !bloquear ? "Enviar denuncia" : "Bloquear"}
        </BotonPrimario>
      </div>
    </div>
  );
}
