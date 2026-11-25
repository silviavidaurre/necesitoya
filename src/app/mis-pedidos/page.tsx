import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavVecino } from "@/components/BarraFlotante";
import { ChipConOpciones } from "@/components/Hoja";
import { iconoDe, useMisPedidos, type MiPedido } from "@/components/useMisPedidos";
import { BotonPrimario, Icono, Pantalla, Pildora, Seccion, Titulo } from "@/components/ui";
import { pesos, rubroPorId, type RubroId } from "@/lib/catalogo";
import { leerCuenta } from "@/lib/cliente";
import { hora, mesYDia } from "@/lib/fechas";
import { Link, useRouter } from "@/lib/navegacion";
import { textoDeTurno } from "@/lib/turnos";

type FiltroDeEstado = "todos" | "en-curso" | "terminados" | "cancelados";

const ESTADOS: { id: FiltroDeEstado; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "en-curso", texto: "En curso" },
  { id: "terminados", texto: "Terminados" },
  { id: "cancelados", texto: "Cancelados" },
];

const enCurso = (p: MiPedido) => p.estado === "en-curso" || p.estado === "para-elegir" || p.estado === "buscando";

function pasaElFiltro(p: MiPedido, estado: FiltroDeEstado, oficio: RubroId | "todos") {
  if (oficio !== "todos" && p.rubro !== oficio) return false;
  if (estado === "en-curso") return enCurso(p);
  if (estado === "terminados") return p.estado === "terminado";
  if (estado === "cancelados") return p.estado === "cancelado";
  return true;
}

// La fecha que cuenta para la lista: cuándo terminó, cuándo se canceló o cuándo se pidió.
function fechaDe(p: MiPedido) {
  return p.datos?.pedido.confirmado ?? p.datos?.pedido.cancelacion?.creado ?? p.datos?.pedido.creado ?? p.creado;
}

function elegidaDe(p: MiPedido) {
  return p.datos?.ofertas.find((o) => o.estado === "elegida") ?? null;
}

// Mis pedidos, como la "Actividad" de una app de viajes: lo que está en curso arriba, con "Ver en vivo", y los
// anteriores con la fecha en un bloque y "Pedir de nuevo". Son los pedidos guardados en este celular (o en la cuenta).
// Los filtros (estado y oficio) trabajan sobre lo ya cargado.
export default function MisPedidos() {
  const router = useRouter();
  const navegar = useNavigate();
  const { pedidos: todos, cargando, sinActualizar } = useMisPedidos();
  // Mientras carga, un pedido que todavía no respondió no se muestra: si no, uno en camino aparecía un momento
  // como "anterior", con "Pedir de nuevo".
  const pedidos = cargando ? todos.filter((p) => p.estado !== "sin-datos") : todos;
  const [estado, setEstado] = useState<FiltroDeEstado>("todos");
  const [oficio, setOficio] = useState<RubroId | "todos">("todos");
  const [conCuenta] = useState(() => Boolean(leerCuenta()));

  const oficios = [...new Set(pedidos.flatMap((p) => (p.rubro ? [p.rubro] : [])))];
  const visibles = pedidos.filter((p) => pasaElFiltro(p, estado, oficio));
  const actuales = visibles.filter(enCurso);
  const anteriores = visibles.filter((p) => !enCurso(p)).sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)));

  function pedirDeNuevo(p: MiPedido) {
    const relato = p.datos?.pedido.relato?.trim() || p.datos?.pedido.descripcion || p.titulo;
    // Abre Contar con el relato y el oficio precargados (el inicio los lee del historial).
    navegar("/", { state: { paso: "contar", relato, rubro: p.rubro ?? undefined } });
  }

  return (
    <>
      <Pantalla conNav>
        <div className="mt-6">
          <Titulo>Mis pedidos</Titulo>
        </div>

        {pedidos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ChipConOpciones
              titulo="Estado"
              opciones={ESTADOS}
              valor={estado}
              alCambiar={setEstado}
              variante="borde"
              texto={estado === "todos" ? "Estado" : ESTADOS.find((e) => e.id === estado)?.texto}
              etiqueta={`Filtrar por estado: ${ESTADOS.find((e) => e.id === estado)?.texto}`}
            />
            {oficios.length > 1 && (
              <ChipConOpciones
                titulo="Oficio"
                opciones={[{ id: "todos" as const, texto: "Todos" }, ...oficios.map((id) => ({ id, texto: rubroPorId(id).nombre, icono: id }))]}
                valor={oficio}
                alCambiar={setOficio}
                variante="borde"
                texto={oficio === "todos" ? "Oficio" : rubroPorId(oficio).nombre}
                etiqueta={`Filtrar por oficio: ${oficio === "todos" ? "todos" : rubroPorId(oficio).nombre}`}
              />
            )}
          </div>
        )}

        {cargando && (
          <div className="mt-6 flex items-center gap-3 text-[15px] text-ink-500" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-acento" aria-hidden="true" />
            Actualizando tus pedidos
          </div>
        )}
        {!cargando && sinActualizar > 0 && (
          <p className="mt-4 text-[15px] text-ink-500" role="status">
            {sinActualizar === 1 ? "No pudimos actualizar un pedido." : `No pudimos actualizar ${sinActualizar} pedidos.`} Si no tenés señal, probá en un rato.
          </p>
        )}

        {pedidos.length === 0 && !cargando && (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-ink">
              <Icono nombre="lista" size={32} />
            </span>
            <p className="mt-4 text-lg font-bold text-ink">Todavía no pediste nada</p>
            <p className="mt-1 text-[15px] text-ink-500">
              {conCuenta ? "Cuando pidas un arreglo, lo seguís desde acá." : "Si ya pediste con tu cuenta, entrá desde Cuenta y aparecen acá."}
            </p>
            <div className="mt-6 w-full">
              <BotonPrimario onClick={() => router.push("/")}>Pedir un arreglo</BotonPrimario>
            </div>
          </div>
        )}

        {pedidos.length > 0 && visibles.length === 0 && <p className="mt-8 text-center text-[15px] text-ink-500">No hay pedidos con ese filtro.</p>}

        {actuales.length > 0 && (
          <>
            <Seccion>En curso</Seccion>
            <div className="mt-3 flex flex-col gap-3">
              {actuales.map((p) => (
                <TarjetaEnCurso key={p.id} pedido={p} />
              ))}
            </div>
          </>
        )}

        {anteriores.length > 0 && (
          <>
            <Seccion>Anteriores</Seccion>
            <div className="mt-3 flex flex-col gap-3">
              {anteriores.map((p) => (
                <FilaAnterior key={p.id} pedido={p} alPedirDeNuevo={() => pedirDeNuevo(p)} />
              ))}
            </div>
          </>
        )}
      </Pantalla>
      <NavVecino />
    </>
  );
}

// Un pedido en curso: oficio y franja, título, precio y estado, y el botón para verlo.
function TarjetaEnCurso({ pedido }: { pedido: MiPedido }) {
  const elegida = elegidaDe(pedido);
  const turno = elegida?.trabajo?.turno;
  const arriba = [pedido.rubro ? rubroPorId(pedido.rubro).nombre : null, turno ? textoDeTurno(turno) : pedido.datos?.pedido.zona].filter(Boolean).join(" · ");
  const boton = pedido.estado === "en-curso" ? { texto: "Ver en vivo", icono: "pin" } : pedido.estado === "para-elegir" ? { texto: "Elegir presupuesto", icono: "lista" } : { texto: "Ver el pedido", icono: "chevron" };
  return (
    <article className="flex flex-col gap-3 rounded-[18px] border border-line p-3.5">
      <div className="flex gap-3.5">
        <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink" aria-hidden="true">
          <Icono nombre={iconoDe(pedido)} size={24} />
          {pedido.sinLeer > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-success ring-2 ring-white" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {arriba && <span className="truncate text-sm text-ink-500">{arriba}</span>}
          <span className="text-[17px] font-bold leading-snug text-ink">{pedido.titulo}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink">
            {elegida && (
              <>
                <span className="cifra font-bold">{pesos(elegida.precio)}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className={`h-2 w-2 shrink-0 rounded-full ${pedido.tono === "bien" ? "bg-success" : pedido.tono === "acento" ? "bg-acento" : "bg-ink-400"}`} aria-hidden="true" />
            <span className={pedido.tono === "bien" ? "font-semibold text-success" : ""}>{pedido.texto}</span>
            {pedido.sinLeer > 0 && <span className="font-semibold text-success">· Mensaje nuevo</span>}
          </span>
        </span>
      </div>
      <Link
        href={`/pedido/${pedido.id}`}
        className={`inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-[15px] font-bold ${pedido.estado === "en-curso" ? "bg-brand text-white" : "bg-subtle text-ink"}`}
      >
        <Icono nombre={boton.icono} size={17} />
        {boton.texto}
      </Link>
    </article>
  );
}

// Un pedido anterior: la fecha en un bloque y una tarjeta con oficio y hora, título, precio y estado.
function FilaAnterior({ pedido, alPedirDeNuevo }: { pedido: MiPedido; alPedirDeNuevo: () => void }) {
  const elegida = elegidaDe(pedido);
  const fecha = fechaDe(pedido);
  const { mes, dia } = mesYDia(fecha);
  const arriba = [pedido.rubro ? rubroPorId(pedido.rubro).nombre : null, hora(fecha)].filter(Boolean).join(" · ");
  const estado =
    pedido.estado === "terminado" && elegida && !elegida.prestador.ejemplo ? `Terminado con ${elegida.prestador.nombre.split(" ")[0]}` : pedido.texto.replace(/ · .*$/, "");
  return (
    <div className="flex gap-3">
      <span className="cifra flex h-[60px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl bg-subtle text-sm leading-tight" aria-hidden="true">
        <span className="text-ink-500">{mes}</span>
        <span className="text-[17px] font-bold text-ink">{dia}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-[18px] border border-line p-3.5">
        <Link href={`/pedido/${pedido.id}`} className="flex flex-col gap-0.5">
          <span className="text-sm text-ink-500">
            <span className="sr-only">{`${dia} de ${mes}. `}</span>
            {arriba}
          </span>
          <span className="text-[17px] font-bold leading-snug text-ink">{pedido.titulo}</span>
          <span className="text-sm text-ink-500">
            {elegida && pedido.estado === "terminado" && (
              <>
                <span className="cifra font-bold text-ink">{pesos(elegida.precio)}</span> ·{" "}
              </>
            )}
            {estado}
          </span>
        </Link>
        {/* Sin datos (sin señal o borrado) no se sabe qué era: no se ofrece repetirlo. */}
        {pedido.estado !== "sin-datos" && (
          <div>
            <Pildora icono="repetir" borde onClick={alPedirDeNuevo}>
              Pedir de nuevo
            </Pildora>
          </div>
        )}
      </div>
    </div>
  );
}
