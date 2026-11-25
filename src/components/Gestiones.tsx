import { useRef, useState } from "react";
import { BotonPrimario, Cabecera, Chip, ErrorDePantalla, Icono, claseCampo } from "@/components/ui";
import { useCerrarConAtras } from "@/components/useAtras";
import { pedir } from "@/lib/cliente";
import { achicarFoto, type FotoLista } from "@/lib/imagen";
import { MOTIVOS_DE_RECLAMO } from "@/lib/motivos";
import { textoDeTurno, type Turno } from "@/lib/turnos";
import { ElegirTurno } from "@/components/Turnos";

// Gestiones de un trabajo elegido, a pantalla completa y con un solo botón: reclamar, cambiar el día, cancelar.
// `quien` es la llave de quien la hace: el vecino con su pedido y su clave, el prestador con su id secreto.
type Quien = { pedidoId: string; clave: string } | { prestadorId: string };

const marco = "fixed inset-0 z-30 mx-auto flex w-full max-w-md flex-col bg-white";

function Hecho({ titulo, texto, boton, alTocar }: { titulo: string; texto: string; boton: string; alTocar: () => void }) {
  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex flex-1 flex-col px-5">
        <Cabecera alVolver={alTocar} cerrar />
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-success">
            <Icono nombre="check" size={36} />
          </span>
          <h1 className="mt-4 text-[28px] font-bold leading-tight text-ink">{titulo}</h1>
          <p className="mt-2 text-[17px] text-ink-500">{texto}</p>
        </div>
      </div>
      <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <BotonPrimario onClick={alTocar}>{boton}</BotonPrimario>
      </div>
    </div>
  );
}

// Reclamo con fotos. El chat del presupuesto también sirve de prueba: lo ve el equipo.
export function PantallaReclamo({ ofertaId, quien, nombre, alCerrar }: { ofertaId: string; quien: Quien; nombre: string; alCerrar: (enviado: boolean) => void }) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fotos, setFotos] = useState<FotoLista[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState<{ disputa: string | null } | null>(null);
  useCerrarConAtras(() => alCerrar(Boolean(enviado)));
  const entrada = useRef<HTMLInputElement>(null);
  const esVecino = "clave" in quien;
  const motivos = MOTIVOS_DE_RECLAMO.filter((m) => (esVecino ? m !== "No me paga" : m !== "Cobró de más" && m !== "No vino"));

  async function sumarFoto(archivo: File | undefined) {
    if (!archivo) return;
    setPreparando(true);
    setError("");
    try {
      const lista = await achicarFoto(archivo);
      setFotos((actuales) => [...actuales, lista].slice(0, 3));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos usar esa foto.");
    } finally {
      setPreparando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const respuesta = await pedir<{ disputa: string | null }>("/api/reclamos", {
        method: "POST",
        body: JSON.stringify({ ofertaId, ...quien, motivo, detalle, fotos: fotos.map((f) => ({ tipo: f.tipo, base64: f.base64 })) }),
        espera: 45_000,
      });
      setEnviado({ disputa: respuesta.disputa });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el reclamo. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return enviado.disputa ? (
      <Hecho
        titulo="Reclamo enviado"
        texto="Como pagaste protegido, abrí también la disputa del pago en Cosmos con tu billetera. La plata queda retenida hasta que se resuelva."
        boton="Abrir la disputa del pago"
        alTocar={() => {
          window.open(enviado.disputa ?? "", "_blank", "noopener");
          alCerrar(true);
        }}
      />
    ) : (
      <Hecho titulo="Reclamo enviado" texto={`Lo revisamos a mano con las fotos y el chat. A ${nombre} le avisamos que hay un reclamo.`} boton="Listo" alTocar={() => alCerrar(true)} />
    );
  }

  const falta = !motivo ? "Elegí qué pasó" : detalle.trim().length < 10 ? "Contá un poco más qué pasó" : "";
  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Reclamo">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={() => alCerrar(false)} cerrar />
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Qué pasó?</h1>
        <p className="mt-2 text-[17px] text-ink-500">Lo revisamos a mano. El chat con {nombre} también sirve de prueba.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {motivos.map((m) => (
            <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>
              {m}
            </Chip>
          ))}
        </div>
        <label className="mt-6 block">
          <span className="text-sm font-semibold text-ink">Contalo con tus palabras</span>
          <textarea className={`${claseCampo} mt-2 min-h-28 resize-none`} value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={800} />
        </label>
        <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => sumarFoto(e.target.files?.[0])} />
        <div className="mt-6">
          <span className="text-sm font-semibold text-ink">Fotos (opcional, hasta 3)</span>
          {fotos.length > 0 && (
            <div className="mt-2 flex gap-2">
              {fotos.map((f, i) => (
                <button key={f.vistaPrevia} type="button" onClick={() => setFotos(fotos.filter((_, j) => j !== i))} aria-label={`Quitar la foto ${i + 1}`}>
                  <img src={f.vistaPrevia} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                </button>
              ))}
            </div>
          )}
          {fotos.length < 3 && (
            <button type="button" onClick={() => entrada.current?.click()} disabled={preparando} className="mt-2 flex min-h-12 items-center gap-2 text-base font-semibold text-brand">
              <Icono nombre="camara" size={20} />
              {preparando ? "Preparando la foto" : "Sumar una foto"}
            </button>
          )}
        </div>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </div>
      <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {falta && (motivo || detalle) && <p className="mb-2 text-center text-[15px] font-medium text-ink-500">{falta}</p>}
        <BotonPrimario onClick={enviar} disabled={Boolean(falta)} cargando={enviando}>
          Enviar reclamo
        </BotonPrimario>
      </div>
    </div>
  );
}

const DIAS = ["Hoy", "Mañana", "Esta semana", "La semana que viene", "A coordinar"];

// Reprogramar: otro de los turnos que ofreció el prestador (o, si no dejó turnos, un día a elegir).
// Queda escrito en el chat para que el otro se entere.
export function PantallaCambiarDia({
  ofertaId,
  quien,
  actual,
  turnos = [],
  alCerrar,
}: {
  ofertaId: string;
  quien: Quien;
  actual: string;
  turnos?: Turno[];
  alCerrar: (nuevo?: string) => void;
}) {
  const [cuando, setCuando] = useState("");
  const [otro, setOtro] = useState("");
  const [turno, setTurno] = useState<Turno | null>(null);
  useCerrarConAtras(() => alCerrar());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const elegido = turno ? textoDeTurno(turno) : (cuando === "otro" ? otro : cuando).trim();

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      const respuesta = await pedir<{ cuando: string }>("/api/ofertas/dia", { method: "POST", body: JSON.stringify({ ofertaId, ...quien, ...(turno ? { turno } : { cuando: elegido }) }) });
      alCerrar(respuesta.cuando);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cambiar el día. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Cambiar el día">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={() => alCerrar()} cerrar />
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Para cuándo?</h1>
        <p className="mt-2 text-base text-ink-500">Ahora: {actual}. Le avisamos.</p>
        {turnos.length > 0 ? (
          <div className="mt-6">
            <ElegirTurno turnos={turnos} valor={turno} alCambiar={setTurno} />
          </div>
        ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          {[...DIAS, "otro"].map((d) => (
            <Chip key={d} activo={cuando === d} onClick={() => setCuando(d)}>
              {d === "otro" ? "Otro día" : d}
            </Chip>
          ))}
        </div>
        )}
        {turnos.length === 0 && cuando === "otro" && <input className={`${claseCampo} mt-4`} value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={80} placeholder="Ej: el sábado a la mañana" autoFocus />}
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </div>
      <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <BotonPrimario onClick={guardar} disabled={!elegido} cargando={enviando}>
          {turno ? textoDeTurno(turno) : "Guardar el nuevo día"}
        </BotonPrimario>
      </div>
    </div>
  );
}

// Cancelar el pedido: pide el motivo (tocando) y confirma. No se puede deshacer.
export function PantallaCancelar({ pedidoId, clave, alCerrar }: { pedidoId: string; clave: string; alCerrar: (cancelado: boolean) => void }) {
  const motivos = ["Ya lo resolví", "Me arreglé con otra persona", "Ya no lo necesito", "Otro motivo"];
  useCerrarConAtras(() => alCerrar(false));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function cancelar() {
    setEnviando(true);
    setError("");
    try {
      await pedir("/api/pedido/cancelar", { method: "POST", body: JSON.stringify({ id: pedidoId, clave, motivo }) });
      alCerrar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cancelarlo. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className={marco} role="dialog" aria-modal="true" aria-label="Cancelar el pedido">
      <div className="sin-barra flex-1 overflow-y-auto px-5 pb-6">
        <Cabecera alVolver={() => alCerrar(false)} cerrar />
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Cancelar el pedido?</h1>
        <p className="mt-2 text-[17px] text-ink-500">Los prestadores dejan de verlo y no se puede deshacer.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {motivos.map((m) => (
            <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>
              {m}
            </Chip>
          ))}
        </div>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </div>
      <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {!motivo && <p className="mb-2 text-center text-[15px] font-medium text-ink-500">Elegí el motivo</p>}
        <BotonPrimario onClick={cancelar} disabled={!motivo} cargando={enviando}>
          Sí, cancelar el pedido
        </BotonPrimario>
      </div>
    </div>
  );
}
