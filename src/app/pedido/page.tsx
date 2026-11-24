import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { BotonPrimario, BotonSecundario, BotonTexto, Cabecera, Cargando, ErrorDePantalla, Estado, Icono, Pantalla, Seccion, Titulo } from "@/components/ui";
import { pesos, rubroPorId } from "@/lib/catalogo";
import { ErrorDePedido, guardarMiPedido, leerMisPedidos, pedir } from "@/lib/cliente";
import { BotonEscuchar } from "@/components/BotonEscuchar";
import { PantallaChat } from "@/components/PantallaChat";
import { Estrellas, ResumenDeReputacion } from "@/components/Reputacion";
import { claseCampo } from "@/components/ui";
import { frasePresupuestos } from "@/lib/frases";
import { Link, useRouter } from "@/lib/navegacion";
import type { Seguimiento } from "@/lib/seguimiento";
import type { OfertaParaCliente } from "@/lib/tipos";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function Avatar({ nombre, size = 48 }: { nombre: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-600"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {iniciales(nombre)}
    </span>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span className="text-[15px] text-ink-500">{etiqueta}</span>
      <span className="text-right text-[15px] font-semibold text-ink">{valor}</span>
    </div>
  );
}

// Seguimiento del pedido para el vecino: ve llegar los presupuestos, les pregunta por el chat y elige uno.
// Todo el contacto es por el chat de la app: acá nunca se muestra un teléfono.
export default function SeguimientoPedido() {
  const { id = "" } = useParams();
  const ubicacion = useLocation();
  const router = useRouter();
  const [clave, setClave] = useState<string | null>(null);
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<OfertaParaCliente | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [calificando, setCalificando] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [pidiendoMuestra, setPidiendoMuestra] = useState(false);
  // El presupuesto cuyo chat está abierto, si hay alguno.
  const [chat, setChat] = useState<OfertaParaCliente | null>(null);
  // Cada cambio hecho desde esta pantalla sube el contador: una consulta automática que salió antes
  // y vuelve después no pisa lo que se acaba de guardar.
  const cambios = useRef(0);

  // La clave sale de este celular o, si abrieron el enlace en otro, de lo que viene después del #.
  useEffect(() => {
    const guardado = leerMisPedidos().find((p) => p.id === id);
    const delEnlace = ubicacion.hash.replace(/^#/, "");
    setClave(guardado?.clave ?? (delEnlace || ""));
  }, [id, ubicacion.hash]);

  const cargar = useCallback(async () => {
    if (!clave) return;
    const alSalir = cambios.current;
    try {
      const respuesta = await pedir<Seguimiento>(`/api/pedido?id=${encodeURIComponent(id)}&clave=${encodeURIComponent(clave)}`);
      if (alSalir !== cambios.current) return;
      setDatos(respuesta);
      setError("");
      guardarMiPedido({ id, clave, titulo: respuesta.pedido.titulo, creado: respuesta.pedido.creado });
    } catch (e) {
      if (e instanceof ErrorDePedido && (e.estado === 403 || e.estado === 404)) setError(e.message);
      else setError("Sin conexión. Seguimos intentando.");
    }
  }, [id, clave]);

  const abierto = datos?.pedido.estado !== "cerrado";
  useEffect(() => {
    cargar();
    // Con el pedido cerrado se sigue consultando, más espaciado: así aparece el aviso de mensaje nuevo.
    const reloj = setInterval(cargar, abierto ? 8_000 : 12_000);
    return () => clearInterval(reloj);
  }, [cargar, abierto]);

  async function elegir(oferta: OfertaParaCliente) {
    if (!clave) return;
    setEligiendo(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/elegir", {
        method: "POST",
        body: JSON.stringify({ id, clave, ofertaId: oferta.id }),
      });
      cambios.current += 1;
      setDatos(respuesta);
      setPorConfirmar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu elección. Probá de nuevo.");
    } finally {
      setEligiendo(false);
    }
  }

  async function calificar() {
    if (!clave || estrellas < 1) return;
    setEnviandoNota(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/calificar", {
        method: "POST",
        body: JSON.stringify({ id, clave, estrellas, comentario }),
      });
      cambios.current += 1;
      setDatos(respuesta);
      setCalificando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu calificación. Probá de nuevo.");
    } finally {
      setEnviandoNota(false);
    }
  }

  async function verMuestra() {
    if (!clave) return;
    setPidiendoMuestra(true);
    setError("");
    try {
      const respuesta = await pedir<Seguimiento>("/api/pedido/muestra", { method: "POST", body: JSON.stringify({ id, clave }) });
      cambios.current += 1;
      setDatos(respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar los presupuestos de muestra. Probá de nuevo.");
    } finally {
      setPidiendoMuestra(false);
    }
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pedido/${id}#${clave}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No pudimos copiar el enlace.");
    }
  }

  if (clave === "") {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/")}>Ir al inicio</BotonPrimario>}>
        <Cabecera volver="/" />
        <Titulo pregunta="Abrilo desde el celular donde lo publicaste, o con el enlace que copiaste.">No encontramos tu pedido</Titulo>
      </Pantalla>
    );
  }

  if (!datos) {
    if (!error) return <Cargando />;
    return (
      <Pantalla>
        <Cabecera volver="/" />
        <ErrorDePantalla>{error}</ErrorDePantalla>
      </Pantalla>
    );
  }

  const { pedido, ofertas, maximo } = datos;
  const rubro = rubroPorId(pedido.rubro);
  const elegida = ofertas.find((o) => o.estado === "elegida");
  const pantallaDeChat =
    chat && clave ? (
      <PantallaChat
        ofertaId={chat.id}
        quien={{ pedidoId: id, clave }}
        nombre={chat.prestador.nombre.split(" ")[0]}
        titulo={pedido.titulo}
        alCerrar={() => {
          setChat(null);
          cargar();
        }}
      />
    ) : null;

  // Confirmar la elección: paso que no se puede deshacer, a pantalla completa y con un solo botón principal.
  if (porConfirmar) {
    const pila = porConfirmar.prestador.nombre.split(" ")[0];
    return (
      <Pantalla
        pie={
          <>
            <BotonPrimario onClick={() => elegir(porConfirmar)} cargando={eligiendo}>
              Sí, elegir a {pila}
            </BotonPrimario>
            <BotonTexto onClick={() => setPorConfirmar(null)}>Volver a los presupuestos</BotonTexto>
          </>
        }
      >
        <Cabecera alVolver={() => setPorConfirmar(null)} cerrar />
        <div className="mt-6 flex flex-col items-center text-center">
          <Avatar nombre={porConfirmar.prestador.nombre} size={88} />
          <h1 className="mt-5 text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink">¿Elegís a {pila}?</h1>
          <p className="mt-3 text-[44px] font-bold leading-none tracking-[-0.03em] text-ink">{pesos(porConfirmar.precio)}</p>
          <p className="mt-2 text-[15px] text-ink-500">Puede ir: {porConfirmar.cuando.toLowerCase()}</p>
        </div>
        <p className="mt-8 text-center text-[15px] text-ink-500">Se cierran los otros presupuestos y se abre el chat para coordinar.</p>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // Calificar: después del trabajo, una pantalla con las estrellas y un comentario opcional.
  if (elegida && calificando) {
    const pila = elegida.prestador.nombre.split(" ")[0];
    return (
      <Pantalla
        pie={
          <BotonPrimario onClick={calificar} disabled={estrellas < 1} cargando={enviandoNota}>
            Enviar calificación
          </BotonPrimario>
        }
      >
        <Cabecera alVolver={() => setCalificando(false)} cerrar />
        <Titulo pregunta="Tu opinión le sirve a otros vecinos.">¿Cómo trabajó {pila}?</Titulo>
        <div className="mt-8">
          <Estrellas valor={estrellas} alElegir={setEstrellas} />
        </div>
        <label className="mt-8 block">
          <span className="text-sm font-semibold text-ink">Contá cómo te fue</span>
          <textarea
            className={`${claseCampo} mt-2 min-h-28 resize-none`}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={300}
            placeholder="Opcional. Si llegó a horario, si quedó bien."
          />
        </label>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  // Resultado: ya eligió. Un check, el nombre y la única acción que queda: escribirle por el chat.
  if (elegida) {
    const pila = elegida.prestador.nombre.split(" ")[0];
    return (
      <>
      <Pantalla
        pie={
          <>
            {!elegida.prestador.ejemplo && (
              <>
                {elegida.sinLeer > 0 && (
                  <p className="mb-2 text-center">
                    <Estado tono="bien">Mensaje nuevo de {pila}</Estado>
                  </p>
                )}
                <BotonPrimario onClick={() => setChat(elegida)}>Escribirle a {pila}</BotonPrimario>
              </>
            )}
            <BotonTexto onClick={() => router.replace("/")}>Volver al inicio</BotonTexto>
          </>
        }
      >
        <Cabecera volver="/" cerrar />
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-subtle text-success">
            <Icono nombre="check" size={44} />
          </span>
          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink">Elegiste a {pila}</h1>
          <p className="mt-2 text-[17px] text-ink-500">
            {elegida.prestador.ejemplo ? "Era un presupuesto de muestra. Con un prestador real, acá se abre el chat para coordinar." : "Coordinen día, hora y pago por el chat. Nadie ve tu teléfono."}
          </p>
        </div>
        <div className="mt-8 divide-y divide-line">
          <Dato etiqueta="Trabajo" valor={pedido.titulo} />
          <Dato etiqueta="Precio" valor={pesos(elegida.precio)} />
          <Dato etiqueta="Puede ir" valor={elegida.cuando} />
          <Dato etiqueta="Prestador" valor={elegida.prestador.nombre} />
        </div>

        <div className="mt-8">
          {pedido.calificacion ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <Estrellas valor={pedido.calificacion.estrellas} size={24} />
              <p className="text-[15px] text-ink-500">Gracias por calificar a {pila}.</p>
            </div>
          ) : (
            <>
              <BotonSecundario onClick={() => setCalificando(true)}>
                <Icono nombre="estrella" size={20} />
                Calificar a {pila}
              </BotonSecundario>
              <p className="mt-3 text-center text-[13px] text-ink-500">Hacelo cuando termine el trabajo.</p>
            </>
          )}
        </div>
      </Pantalla>
      {pantallaDeChat}
      </>
    );
  }

  return (
    <>
    <Pantalla>
      <Cabecera volver="/" />
      <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink">{pedido.titulo}</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-500">
        <Icono nombre={rubro.id} size={18} className="text-ink" />
        {rubro.nombre} · {pedido.zona}
      </p>
      {pedido.precioMin !== null && pedido.precioMax !== null && (
        <p className="mt-1 text-[15px] text-ink-500">
          Suele costar {pesos(pedido.precioMin)} a {pesos(pedido.precioMax)}
        </p>
      )}

      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

      <Seccion derecha={`${ofertas.filter((o) => !o.prestador.ejemplo).length} de ${maximo}`}>Presupuestos</Seccion>
      {ofertas.length > 0 && <BotonEscuchar texto={frasePresupuestos(ofertas)} />}

      {ofertas.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-subtle text-ink">
            <Icono nombre="reloj" size={32} />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">Buscando prestadores</p>
          <p className="mt-1 text-[15px] text-ink-500">Aparecen acá apenas respondan. No hace falta actualizar.</p>
          <div className="mt-6 w-full">
            <BotonSecundario onClick={verMuestra} disabled={pidiendoMuestra}>
              {pidiendoMuestra ? "Cargando" : "Ver presupuestos de muestra"}
            </BotonSecundario>
            <p className="mt-2 text-[13px] text-ink-500">Para probar cómo se ve. Son de prestadores inventados.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {ofertas.map((oferta) => {
            const dentro =
              pedido.precioMin !== null && pedido.precioMax !== null && oferta.precio >= pedido.precioMin && oferta.precio <= pedido.precioMax;
            const pila = oferta.prestador.nombre.split(" ")[0];
            return (
              <li key={oferta.id} className="entrar py-6">
                <div className="flex items-center gap-4">
                  <Avatar nombre={oferta.prestador.nombre} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-ink">{oferta.prestador.nombre}</p>
                    {oferta.prestador.ejemplo ? (
                      <Estado>De muestra</Estado>
                    ) : (
                      <ResumenDeReputacion reputacion={oferta.prestador.reputacion} aniosExperiencia={oferta.prestador.aniosExperiencia} />
                    )}
                  </div>
                  <Link href={`/p/${oferta.prestador.id}`} className="flex h-12 shrink-0 items-center text-[15px] font-semibold text-brand">
                    Ver perfil
                  </Link>
                </div>

                <p className="mt-4 text-[36px] font-bold leading-none tracking-[-0.03em] text-ink">{pesos(oferta.precio)}</p>
                <p className="mt-2 text-sm text-ink-500">Mano de obra. Puede ir: {oferta.cuando.toLowerCase()}.</p>
                {dentro && (
                  <p className="mt-2">
                    <Estado tono="bien">Dentro de lo que suele costar</Estado>
                  </p>
                )}
                {oferta.mensaje && <p className="mt-3 text-[15px] italic text-ink-500">“{oferta.mensaje}”</p>}
                {oferta.prestador.fotos.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {oferta.prestador.fotos.map((fotoId) => (
                      <img key={fotoId} src={`/api/fotos?id=${fotoId}`} alt={`Trabajo de ${pila}`} loading="lazy" className="h-20 w-20 rounded-2xl object-cover" />
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <BotonSecundario onClick={() => setPorConfirmar(oferta)}>Elegir a {pila}</BotonSecundario>
                </div>
                {oferta.prestador.ejemplo ? (
                  <p className="mt-3 text-center text-[13px] text-ink-500">Es de muestra: no se le puede escribir.</p>
                ) : (
                  <button type="button" onClick={() => setChat(oferta)} className="mx-auto mt-1 flex min-h-12 flex-col items-center justify-center gap-1 px-4 py-2 text-base font-semibold text-brand">
                    <span className="flex items-center gap-2">
                      <Icono nombre="mensaje" size={20} />
                      Preguntarle a {pila}
                    </span>
                    {oferta.sinLeer > 0 && <Estado tono="bien">Mensaje nuevo</Estado>}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8">
        <BotonSecundario onClick={copiarEnlace}>
          <Icono nombre={copiado ? "check" : "enlace"} size={20} />
          {copiado ? "Enlace copiado" : "Copiar enlace del pedido"}
        </BotonSecundario>
        <p className="mt-3 text-center text-[13px] text-ink-500">Con ese enlace lo seguís desde cualquier celular.</p>
      </div>
    </Pantalla>
    {pantallaDeChat}
    </>
  );
}
