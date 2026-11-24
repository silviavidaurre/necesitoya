import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EntrarACuenta } from "@/components/EntrarACuenta";
import { Logo } from "@/components/Logo";
import { NavPrestador } from "@/components/NavPrestador";
import { PantallaOferta } from "@/components/PantallaOferta";
import { usePrestador } from "@/components/usePrestador";
import { BotonPrimario, Cargando, Chip, ErrorDePantalla, Estado, Fila, IconoCirculo, Pantalla, Segmentado, SinConexion, Titulo } from "@/components/ui";
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

type Filtro = "mios" | "todos";

interface OfertaMia {
  id: string;
  estado: "enviada" | "elegida" | "descartada";
  pedido: { titulo: string } | null;
  sinLeer: number;
}

// Entrada del prestador: todos los pedidos abiertos, a la vista aunque todavía no se haya anotado.
// Tocar uno abre el detalle (foto, descripción, lo que suele costar) y desde ahí se manda el precio.
export default function PedidosPrestador() {
  const router = useRouter();
  const [parametros, setParametros] = useSearchParams();
  const { prestador, cargando, sinConexion, reintentar } = usePrestador({ obligatorio: false });
  const [pedidos, setPedidos] = useState<PedidoParaPrestador[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("mios");
  const [rubro, setRubro] = useState<RubroId | null>(null);
  const [elegido, setElegido] = useState<PedidoParaPrestador | null>(null);
  const [meEligieron, setMeEligieron] = useState<OfertaMia[]>([]);
  const [hayMensajes, setHayMensajes] = useState(false);
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
      setMeEligieron(datos.ofertas.filter((o) => o.estado === "elegida"));
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

  const base = prestador && filtro === "mios" ? (pedidos?.filter((p) => p.coincide) ?? []) : (pedidos ?? []);
  const visibles = rubro ? base.filter((p) => p.rubro === rubro) : base;
  // Solo los oficios que tienen algún pedido, para no mostrar filtros vacíos.
  const rubrosConPedidos = [...new Set((pedidos ?? []).map((p) => p.rubro))];

  return (
    <>
      <Pantalla conNav={Boolean(prestador)} pie={prestador ? undefined : <BotonPrimario href="/prestador/alta">Anotarme gratis</BotonPrimario>}>
        <header className="flex h-[60px] items-center justify-between">
          <Logo />
          <Link href="/" className="flex min-h-12 items-center text-base font-semibold text-brand">
            Necesito algo
          </Link>
        </header>

        <div className="mt-3">
          <Titulo pregunta={prestador ? `Hola, ${prestador.nombre.split(" ")[0]}. ¿Cuál querés presupuestar?` : "Vecinos que necesitan un trabajo. Tocá uno para ver el detalle."}>Pedidos</Titulo>
        </div>

        {meEligieron.length > 0 && (
          <div className="mt-4 divide-y divide-line">
            {meEligieron.slice(0, 2).map((oferta) => (
              <Fila
                key={oferta.id}
                href="/prestador/ofertas"
                icono={<IconoCirculo nombre="check" />}
                titulo={`Te eligieron: ${oferta.pedido?.titulo ?? "un pedido"}`}
                detalle={<Estado tono="bien">{oferta.sinLeer > 0 ? "Mensaje nuevo. Abrí el chat" : "Abrí el chat para coordinar"}</Estado>}
              />
            ))}
          </div>
        )}

        {prestador ? (
          <div className="mt-6">
            <Segmentado<Filtro>
              opciones={[
                { id: "mios", texto: "De mis oficios" },
                { id: "todos", texto: "Todos" },
              ]}
              valor={filtro}
              alCambiar={(valor) => {
                setFiltro(valor);
                setRubro(null);
              }}
            />
          </div>
        ) : (
          rubrosConPedidos.length > 1 && (
            <div className="sin-barra -mx-6 mt-5 flex gap-2 overflow-x-auto px-6 pb-1">
              <Chip activo={rubro === null} onClick={() => setRubro(null)}>
                Todos
              </Chip>
              {rubrosConPedidos.map((id) => (
                <span key={id} className="shrink-0">
                  <Chip activo={rubro === id} onClick={() => setRubro(rubro === id ? null : id)}>
                    {rubroPorId(id).nombre}
                  </Chip>
                </span>
              ))}
            </div>
          )
        )}

        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

        {pedidos === null ? (
          <div className="mt-10 flex justify-center">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-ink" role="status" aria-label="Cargando" />
          </div>
        ) : visibles.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <IconoCirculo nombre="bandeja" size={72} />
            <p className="mt-4 text-lg font-bold text-ink">Todavía no hay pedidos</p>
            <p className="mt-1 text-[15px] text-ink-500">{prestador && filtro === "mios" ? "Mirá en Todos, o volvé en un rato." : "Volvé en un rato."}</p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {visibles.map((pedido) => {
              const rubroDelPedido = rubroPorId(pedido.rubro);
              const lleno = pedido.cupos === 0;
              return (
                <Fila
                  key={pedido.id}
                  onClick={() => setElegido(pedido)}
                  icono={<IconoCirculo nombre={rubroDelPedido.id} />}
                  titulo={pedido.titulo}
                  detalle={
                    <>
                      {pedido.zona} · {URGENCIA[pedido.urgencia]} · {pedido.ejemplo ? "Ejemplo" : haceCuanto(pedido.creado)}
                      {pedido.precioMin !== null && pedido.precioMax !== null && (
                        <span className="mt-1 block text-base font-bold text-ink">
                          {pesos(pedido.precioMin)} a {pesos(pedido.precioMax)}
                        </span>
                      )}
                      <span className="mt-1 block">
                        {pedido.yaOferte ? (
                          <Estado tono="bien">Presupuesto enviado</Estado>
                        ) : pedido.reservadoMin > 0 ? (
                          <Estado>Último lugar guardado para el barrio · {pedido.reservadoMin} min</Estado>
                        ) : lleno ? (
                          <Estado>Completo</Estado>
                        ) : (
                          <Estado>
                            {pedido.ofertas} de {MAX_OFERTAS} presupuestos{pedido.enMiZona ? " · En tu zona" : ""}
                          </Estado>
                        )}
                      </span>
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        {!prestador && (
          <EntrarACuenta motivo="Si ya tenés cuenta, entrá y recuperás tu perfil." />
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
