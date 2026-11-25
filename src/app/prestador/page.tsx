import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { ChipConOpciones } from "@/components/Hoja";
import { Mapa } from "@/components/Mapa";
import { NavPrestador } from "@/components/NavPrestador";
import { PantallaOferta } from "@/components/PantallaOferta";
import { usePrestador } from "@/components/usePrestador";
import { Cargando, Chip, ErrorDePantalla, Icono, Pantalla, PildoraFlotante, SinConexion } from "@/components/ui";
import { MAX_OFERTAS, pesos, rubroPorId, type RubroId } from "@/lib/catalogo";
import { pedir } from "@/lib/cliente";
import { Link, useRouter } from "@/lib/navegacion";
import type { PedidoParaPrestador } from "@/lib/tipos";

const URGENCIA = { hoy: "Para hoy", semana: "Esta semana", flexible: "Sin apuro" } as const;

function haceCuanto(fecha: string) {
  const minutos = Math.max(1, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

// Nuevo = de la última media hora y todavía sin tu presupuesto: va en naranja en el mapa y en la lista.
const esNuevo = (p: PedidoParaPrestador) => !p.yaOferte && !p.ejemplo && Date.now() - new Date(p.creado).getTime() < 30 * 60_000;

// Filtro de oficio: los míos, todos o uno en particular. Filtro de zona: las mías, todos los barrios o uno.
type FiltroDeOficio = "mios" | "todos" | RubroId;
type FiltroDeZona = "mias" | "todas" | string;

interface OfertaMia {
  id: string;
  estado: "enviada" | "elegida" | "descartada";
  pedido: { titulo: string; confirmado: string | null; estado: "abierto" | "cerrado" | "cancelado" } | null;
  // Ya avisó que terminó: deja de ser un "trabajo en curso" aunque el vecino todavía no confirme.
  terminado?: { creado: string } | null;
  sinLeer: number;
}

// Pedidos cerca, como la pantalla de un conductor: el mapa con los pedidos como círculos con el ícono del oficio,
// el chip de zonas y, en la hoja, los oficios en chips y la lista. Cada fila dice cuántos lugares quedan (●●○).
// Se ve aunque todavía no se haya anotado: el llamado a anotarse va arriba de la lista, sin taparla.
export default function PedidosPrestador() {
  const router = useRouter();
  const [parametros, setParametros] = useSearchParams();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador({ obligatorio: false });
  const [pedidos, setPedidos] = useState<PedidoParaPrestador[] | null>(null);
  const [oficio, setOficio] = useState<FiltroDeOficio>("mios");
  const [zona, setZona] = useState<FiltroDeZona>("mias");
  const [elegido, setElegido] = useState<PedidoParaPrestador | null>(null);
  const [meEligieron, setMeEligieron] = useState<OfertaMia[]>([]);
  const [hayMensajes, setHayMensajes] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");

  const prestadorId = prestador?.id ?? null;
  const cargar = useCallback(async () => {
    if (cargando) return;
    try {
      const datos = await pedir<{ pedidos: PedidoParaPrestador[] }>(prestadorId ? `/api/pedidos?prestadorId=${encodeURIComponent(prestadorId)}` : "/api/pedidos");
      setPedidos(datos.pedidos);
      setError("");
    } catch {
      setError("Sin conexión. Seguimos intentando.");
    }
    if (!prestadorId) return;
    try {
      const datos = await pedir<{ ofertas: OfertaMia[] }>(`/api/ofertas?prestadorId=${encodeURIComponent(prestadorId)}`);
      // Solo los trabajos que siguen en curso: los que el vecino ya confirmó o canceló quedan en Mis presupuestos.
      setMeEligieron(datos.ofertas.filter((o) => o.estado === "elegida" && !o.terminado && !o.pedido?.confirmado && o.pedido?.estado !== "cancelado"));
      setHayMensajes(datos.ofertas.some((o) => o.sinLeer > 0));
    } catch {
      // Es un aviso extra: si falla, la lista de pedidos sigue funcionando.
    }
  }, [prestadorId, cargando]);

  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 15_000);
    return () => clearInterval(reloj);
  }, [cargar]);

  // Si vuelve de anotarse para presupuestar un pedido puntual, se le abre ese pedido.
  const pedidoPendiente = parametros.get("pedido");
  useEffect(() => {
    if (!pedidoPendiente || !pedidos) return;
    const encontrado = pedidos.find((p) => p.id === pedidoPendiente);
    if (encontrado) setElegido(encontrado);
    setParametros({}, { replace: true });
  }, [pedidoPendiente, pedidos, setParametros]);

  if (sinConexion) return <SinConexion alReintentar={reintentar} />;
  if (cargando) return <Cargando />;

  const todos = pedidos ?? [];
  const misZonas = prestador?.zonas ?? [];
  // Sin zonas cargadas, o con "Toda la ciudad" (como lo cuenta el servidor), "Mis zonas" son todos los barrios.
  const todaLaCiudad = misZonas.length === 0 || misZonas.includes("Toda la ciudad");
  // Sin perfil no hay "míos": se ve todo.
  const filtroDeOficio: FiltroDeOficio = !prestador && oficio === "mios" ? "todos" : oficio;
  const filtroDeZona: FiltroDeZona = !prestador && zona === "mias" ? "todas" : zona;
  const visibles = todos.filter(
    (p) =>
      (filtroDeOficio === "todos" || (filtroDeOficio === "mios" ? p.coincide : p.rubro === filtroDeOficio)) &&
      (filtroDeZona === "todas" || (filtroDeZona === "mias" ? todaLaCiudad || misZonas.includes(p.zona) || p.enMiZona : p.zona === filtroDeZona)),
  );
  // Solo los oficios y barrios que tienen algún pedido, para no mostrar filtros vacíos.
  const rubrosConPedidos = [...new Set(todos.map((p) => p.rubro))];
  const zonasConPedidos = [...new Set(todos.map((p) => p.zona))];
  const textoDeZona =
    filtroDeZona === "mias" ? (todaLaCiudad ? "Toda la ciudad" : `${misZonas[0]}${misZonas.length > 1 ? ` +${misZonas.length - 1}` : ""}`) : filtroDeZona === "todas" ? "Todos los barrios" : filtroDeZona;
  const nuevos = visibles.filter(esNuevo).length;

  return (
    <>
      <Pantalla
        conNav={Boolean(prestador)}
        mapa={
          <Mapa alto={280} variante="inicio" etiqueta={filtroDeZona === "mias" || filtroDeZona === "todas" ? "San Salvador de Jujuy" : filtroDeZona} puntos={visibles.slice(0, 6).map((p) => ({ icono: rubroPorId(p.rubro).id, acento: esNuevo(p) }))}>
            <ChipConOpciones
              titulo="Zonas"
              variante="flotante"
              icono="pin"
              valor={filtroDeZona}
              alCambiar={setZona}
              texto={textoDeZona}
              etiqueta={`Zonas: ${textoDeZona}. Cambiar`}
              opciones={[
                ...(prestador ? [{ id: "mias", texto: "Mis zonas", detalle: misZonas.length > 0 ? misZonas.join(", ") : "Todavía no cargaste zonas: se ven todas", icono: "pin" }] : []),
                { id: "todas", texto: "Todos los barrios", icono: "casa" },
                ...zonasConPedidos.map((z) => ({ id: z, texto: z, icono: "pin" })),
              ]}
            />
            <PildoraFlotante href="/">Necesito algo</PildoraFlotante>
          </Mapa>
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">Pedidos cerca</h1>
          {nuevos > 0 && (
            <span className="shrink-0 text-sm text-ink-500">
              {nuevos} {nuevos === 1 ? "nuevo" : "nuevos"}
            </span>
          )}
        </div>

        <div className="sin-barra -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {prestador && (
            <span className="shrink-0">
              <Chip activo={filtroDeOficio === "mios"} onClick={() => setOficio("mios")}>
                Mis oficios
              </Chip>
            </span>
          )}
          <span className="shrink-0">
            <Chip activo={filtroDeOficio === "todos"} onClick={() => setOficio("todos")}>
              Todos
            </Chip>
          </span>
          {rubrosConPedidos.map((id) => (
            <span key={id} className="shrink-0">
              <Chip activo={filtroDeOficio === id} onClick={() => setOficio(filtroDeOficio === id ? "todos" : id)}>
                {rubroPorId(id).nombre}
              </Chip>
            </span>
          ))}
        </div>

        {!prestador && (
          <section aria-label="Anotarte" className="mt-4 rounded-[18px] bg-subtle p-4">
            <p className="text-[17px] font-bold text-ink">¿Querés presupuestar?</p>
            <p className="mt-1 text-[15px] leading-snug text-ink-500">Anotate gratis: contás qué hacés y mandás tu precio a los vecinos de tu barrio.</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href="/prestador/alta" className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-bold text-white">
                Anotarme gratis
              </Link>
              <button type="button" onClick={() => setEntrando((v) => !v)} aria-expanded={entrando} className="flex min-h-11 items-center text-[15px] font-semibold text-ink underline underline-offset-[3px]">
                Ya tengo cuenta
              </button>
            </div>
            {entrando && <EntrarACuenta abiertoAlInicio titulo="Entrá con tu cuenta" motivo="Recuperás tu perfil de prestador." />}
          </section>
        )}

        {meEligieron.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {meEligieron.slice(0, 2).map((oferta) => (
              <Link key={oferta.id} href={`/prestador/ofertas?trabajo=${oferta.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl bg-success-50 px-4 py-3">
                <Icono nombre="check" size={22} className="shrink-0 text-success" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-ink">Te eligieron: {oferta.pedido?.titulo ?? "un pedido"}</span>
                  <span className="block text-sm font-semibold text-success">{oferta.sinLeer > 0 ? "Mensaje nuevo" : "Trabajo en curso"}</span>
                </span>
                <Icono nombre="chevron" size={20} className="shrink-0 text-ink-500" />
              </Link>
            ))}
          </div>
        )}

        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {pedidos === null ? (
          <div className="mt-10 flex justify-center">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-ink" role="status" aria-label="Cargando" />
          </div>
        ) : visibles.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-ink">
              <Icono nombre="bandeja" size={32} />
            </span>
            <p className="mt-4 text-lg font-bold text-ink">Todavía no hay pedidos</p>
            <p className="mt-1 text-[15px] text-ink-500">{filtroDeOficio !== "todos" || filtroDeZona !== "todas" ? "Probá con Todos o con otros barrios, o volvé en un rato." : "Volvé en un rato."}</p>
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {visibles.map((pedido) => (
              <li key={pedido.id}>
                <FilaDePedido pedido={pedido} alTocar={() => setElegido(pedido)} />
              </li>
            ))}
          </ul>
        )}
      </Pantalla>

      {elegido && (
        <PantallaOferta
          pedido={elegido}
          prestadorId={prestadorId}
          conCuenta={prestador?.conCuenta !== false}
          alAnotarse={() => router.push(`/prestador/alta?pedido=${encodeURIComponent(elegido.id)}`)}
          alCerrar={() => setElegido(null)}
          alEnviar={() => {
            setElegido(null);
            cargar();
          }}
        />
      )}
      {prestador && <NavPrestador aviso={hayMensajes} />}
    </>
  );
}

// Una fila de pedido: ícono del oficio, título, "barrio · urgencia · hace X", lo que suele costar y, a la derecha,
// los lugares ocupados como puntos. El último lugar, si está guardado para el barrio, va en naranja.
function FilaDePedido({ pedido, alTocar }: { pedido: PedidoParaPrestador; alTocar: () => void }) {
  const nuevo = esNuevo(pedido);
  const reservado = pedido.reservadoMin > 0;
  const ocupados = Math.min(pedido.ofertas, MAX_OFERTAS);
  const estado = pedido.yaOferte
    ? { texto: "Enviado", clase: "font-bold text-success" }
    : reservado
      ? { texto: `Lugar del barrio · ${pedido.reservadoMin} min`, clase: "font-bold text-acento" }
      : pedido.cupos === 0
        ? { texto: "Completo", clase: "text-ink-500" }
        : { texto: `${pedido.ofertas} de ${MAX_OFERTAS}`, clase: "text-ink-500" };
  const resumen = `${pedido.ofertas} de ${MAX_OFERTAS} presupuestos${reservado ? `, el último guardado para prestadores de ${pedido.zona}` : ""}${pedido.yaOferte ? ", ya mandaste el tuyo" : ""}.`;
  return (
    <button type="button" onClick={alTocar} className="flex w-full gap-3.5 py-3.5 text-left">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${nuevo ? "bg-acento text-[#0d0d0d]" : "bg-subtle text-ink"}`} aria-hidden="true">
        <Icono nombre={rubroPorId(pedido.rubro).id} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-base font-bold leading-snug text-ink">{pedido.titulo}</span>
        <span className="text-[13px] text-ink-500">
          {pedido.zona} · {URGENCIA[pedido.urgencia]} · {pedido.ejemplo ? "Ejemplo" : haceCuanto(pedido.creado)}
          {pedido.demo ? " · Demostración" : ""}
        </span>
        {pedido.precioMin !== null && pedido.precioMax !== null && (
          <span className="cifra text-[15px] font-bold text-ink">
            {pesos(pedido.precioMin)} a {pesos(pedido.precioMax)}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 pt-1 text-xs">
        <span className="flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: MAX_OFERTAS }, (_, i) => {
            const color = i < ocupados ? "bg-ink" : reservado && i === MAX_OFERTAS - 1 ? "bg-acento" : "bg-line";
            return <span key={i} className={`h-2 w-2 rounded-full ${color}`} />;
          })}
        </span>
        <span className={`max-w-[96px] text-right leading-tight ${estado.clase}`}>{estado.texto}</span>
        <span className="sr-only">{resumen}</span>
      </span>
    </button>
  );
}
