import { useCallback, useEffect, useState } from "react";
import { BotonPrimario, BotonSecundario, Campo, ErrorDePantalla, Estado, Pantalla, Seccion, Segmentado, Titulo, claseCampo } from "@/components/ui";

// Panel interno de NecesitoYa: verificaciones, denuncias, reclamos, métricas y limpieza de datos de prueba.
// Pide el secreto de administración; se guarda solo mientras dure la pestaña.

const LLAVE = "necesitoya.admin";

function leerSecreto() {
  try {
    return sessionStorage.getItem(LLAVE) ?? "";
  } catch {
    return "";
  }
}

async function api<T>(secreto: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const respuesta = await fetch(ruta, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-admin": secreto },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw Object.assign(new Error(datos?.error ?? "Algo salió mal."), { estado: respuesta.status });
  return datos as T;
}

// Las fotos privadas se piden con el secreto y se muestran como imagen local.
function FotoPrivada({ secreto, id, alt }: { secreto: string; id: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let vigente = true;
    let creada = "";
    fetch(`/api/admin/documento?id=${encodeURIComponent(id)}`, { headers: { "x-admin": secreto } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && vigente) {
          creada = URL.createObjectURL(blob);
          setUrl(creada);
        }
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [secreto, id]);
  if (!url) return <span className="flex h-40 w-full items-center justify-center rounded-2xl bg-subtle text-sm text-ink-500">Cargando foto</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} className="max-h-72 w-full rounded-2xl object-contain bg-subtle" />
    </a>
  );
}

interface Mensaje {
  id: string;
  de: "vecino" | "prestador";
  texto: string;
  creado: string;
}

function Conversacion({ mensajes, resaltado }: { mensajes: Mensaje[]; resaltado?: string }) {
  if (mensajes.length === 0) return <p className="mt-2 text-sm text-ink-500">Sin mensajes en el chat.</p>;
  return (
    <details className="mt-3">
      <summary className="flex min-h-12 cursor-pointer items-center text-[15px] font-semibold text-brand">Ver el chat ({mensajes.length})</summary>
      <ul className="mt-2 space-y-2">
        {mensajes.map((m) => (
          <li key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.id === resaltado ? "bg-[#fdecea]" : "bg-subtle"}`}>
            <span className="font-semibold">{m.de === "vecino" ? "Vecino" : "Prestador"}:</span> {m.texto}
          </li>
        ))}
      </ul>
    </details>
  );
}

type Vista = "pendientes" | "metricas" | "pruebas" | "demo";

export default function PanelInterno() {
  const [secreto, setSecreto] = useState("");
  const [escrito, setEscrito] = useState("");
  const [vista, setVista] = useState<Vista>("pendientes");
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [datos, setDatos] = useState<Record<string, any>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setSecreto(leerSecreto());
    document.title = "Panel interno · NecesitoYa";
  }, []);

  const cargar = useCallback(async () => {
    if (!secreto) return;
    setError("");
    try {
      if (vista === "pendientes") {
        const [v, d, r, b] = await Promise.all([
          api<{ verificaciones: unknown[] }>(secreto, "/api/admin?seccion=verificaciones"),
          api<{ denuncias: unknown[] }>(secreto, "/api/admin?seccion=denuncias"),
          api<{ reclamos: unknown[] }>(secreto, "/api/admin?seccion=reclamos"),
          api<{ bajas: unknown[] }>(secreto, "/api/admin?seccion=bajas"),
        ]);
        setDatos({ ...v, ...d, ...r, ...b });
      } else {
        setDatos(await api(secreto, `/api/admin?seccion=${vista}`));
      }
    } catch (e) {
      const estado = (e as { estado?: number }).estado;
      if (estado === 401 || estado === 429) {
        try {
          sessionStorage.removeItem(LLAVE);
        } catch {
          // Nada que limpiar.
        }
        setSecreto("");
      }
      setError(e instanceof Error ? e.message : "No pudimos cargar el panel.");
    }
  }, [secreto, vista]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function hacer(cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError("");
    try {
      await api(secreto, "/api/admin", cuerpo);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer.");
    } finally {
      setOcupado(false);
    }
  }

  if (!secreto) {
    return (
      <Pantalla
        pie={
          <BotonPrimario
            disabled={escrito.length < 8}
            onClick={() => {
              try {
                sessionStorage.setItem(LLAVE, escrito);
              } catch {
                // Sin almacenamiento, el secreto queda solo en memoria.
              }
              setSecreto(escrito);
            }}
          >
            Entrar
          </BotonPrimario>
        }
      >
        <div className="mt-[60px]">
          <Titulo pregunta="Solo para el equipo de NecesitoYa.">Panel interno</Titulo>
        </div>
        <Campo etiqueta="Clave del panel">
          <input className={claseCampo} type="password" value={escrito} onChange={(e) => setEscrito(e.target.value)} autoComplete="off" />
        </Campo>
        {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
      </Pantalla>
    );
  }

  const m = datos.metricas;
  return (
    <Pantalla>
      <div className="mt-8">
        <Titulo>Panel interno</Titulo>
      </div>
      <div className="mt-6">
        <Segmentado<Vista>
          opciones={[
            { id: "pendientes", texto: "Revisar" },
            { id: "metricas", texto: "Métricas" },
            { id: "pruebas", texto: "Pruebas" },
            { id: "demo", texto: "Demo" },
          ]}
          valor={vista}
          alCambiar={(v) => {
            setDatos({});
            setVista(v);
          }}
        />
      </div>
      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}

      {vista === "pendientes" && (
        <>
          <Seccion derecha={String(datos.bajas?.length ?? "")}>Pedidos de baja</Seccion>
          {datos.bajas?.length === 0 && <p className="mt-2 text-[15px] text-ink-500">No hay pedidos de eliminar cuentas.</p>}
          <ul className="divide-y divide-line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {datos.bajas?.map((b: any) => (
              <li key={b.id} className="py-5">
                <p className="text-base font-semibold text-ink">{b.email}</p>
                <p className="text-sm text-ink-500">
                  {new Date(b.creado).toLocaleString("es-AR")} · {b.tieneCuenta ? "tiene cuenta con mail" : "no hay cuenta con ese mail (puede ser de Google: escribile)"}
                </p>
                <div className="mt-3">
                  <BotonSecundario
                    disabled={ocupado}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la cuenta de ${b.email}? No se puede deshacer.`)) void hacer({ accion: "baja", id: b.id });
                    }}
                  >
                    {b.tieneCuenta ? "Eliminar la cuenta" : "Marcar como resuelto"}
                  </BotonSecundario>
                </div>
              </li>
            ))}
          </ul>

          <Seccion derecha={String(datos.verificaciones?.length ?? "")}>Verificaciones</Seccion>
          {datos.verificaciones?.length === 0 && <p className="mt-2 text-[15px] text-ink-500">No hay trámites pendientes.</p>}
          <ul className="divide-y divide-line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {datos.verificaciones?.map((v: any) => (
              <li key={v.id} className="py-5">
                <p className="text-base font-semibold text-ink">{v.prestador.nombre}</p>
                <p className="text-sm text-ink-500">
                  {v.tipo === "dni" ? "DNI y selfie" : `Matrícula o certificado${v.numero ? ` · N.º ${v.numero}` : ""}`} · {new Date(v.creado).toLocaleString("es-AR")}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {v.documentos.map((doc: string, i: number) => (
                    <FotoPrivada key={doc} secreto={secreto} id={doc} alt={`Documento ${i + 1} de ${v.prestador.nombre}`} />
                  ))}
                </div>
                <input
                  className={`${claseCampo} mt-3`}
                  placeholder="Motivo si la rechazás (lo ve el prestador)"
                  value={motivos[v.id] ?? ""}
                  onChange={(e) => setMotivos({ ...motivos, [v.id]: e.target.value })}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <BotonSecundario disabled={ocupado} onClick={() => hacer({ accion: "verificacion", id: v.id, aprobar: true })}>
                    Aprobar
                  </BotonSecundario>
                  <BotonSecundario disabled={ocupado || !motivos[v.id]} onClick={() => hacer({ accion: "verificacion", id: v.id, aprobar: false, motivo: motivos[v.id] })}>
                    Rechazar
                  </BotonSecundario>
                </div>
              </li>
            ))}
          </ul>

          <Seccion derecha={String(datos.denuncias?.length ?? "")}>Denuncias</Seccion>
          {datos.denuncias?.length === 0 && <p className="mt-2 text-[15px] text-ink-500">No hay denuncias abiertas.</p>}
          <ul className="divide-y divide-line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {datos.denuncias?.map((d: any) => (
              <li key={d.id} className="py-5">
                <p className="text-base font-semibold text-ink">
                  {d.motivo} · {d.tipo === "perfil" ? "perfil" : "mensaje"}
                </p>
                {d.perfil && (
                  <p className="text-sm text-ink-500">
                    {d.perfil.nombre} · {d.denunciasPrevias} {d.denunciasPrevias === 1 ? "denuncia" : "denuncias"} {d.perfil.suspendido ? "· suspendido" : ""}
                  </p>
                )}
                {d.detalle && <p className="mt-2 text-[15px] text-ink">“{d.detalle}”</p>}
                {d.mensaje && <p className="mt-2 rounded-xl bg-[#fdecea] px-3 py-2 text-sm">{d.mensaje.texto}</p>}
                <Conversacion mensajes={d.conversacion} resaltado={d.tipo === "mensaje" ? d.objetivo : undefined} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <BotonSecundario disabled={ocupado} onClick={() => hacer({ accion: "denuncia", id: d.id, estado: "resuelta" })}>
                    Resuelta
                  </BotonSecundario>
                  <BotonSecundario disabled={ocupado} onClick={() => hacer({ accion: "denuncia", id: d.id, estado: "descartada" })}>
                    Descartar
                  </BotonSecundario>
                </div>
                {d.perfil && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => hacer({ accion: "suspender", idPublico: d.perfil.idPublico, suspendido: !d.perfil.suspendido })}
                    className="mt-2 flex min-h-12 items-center text-[15px] font-semibold text-danger"
                  >
                    {d.perfil.suspendido ? "Reactivar el perfil" : "Suspender el perfil"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          <Seccion derecha={String(datos.reclamos?.length ?? "")}>Reclamos</Seccion>
          {datos.reclamos?.length === 0 && <p className="mt-2 text-[15px] text-ink-500">No hay reclamos abiertos.</p>}
          <ul className="divide-y divide-line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {datos.reclamos?.map((r: any) => (
              <li key={r.id} className="py-5">
                <p className="text-base font-semibold text-ink">
                  {r.motivo} · reclama el {r.de === "vecino" ? `vecino (${r.vecino})` : `prestador (${r.prestador.nombre})`}
                </p>
                <p className="text-sm text-ink-500">
                  {r.trabajo.titulo} · ${new Intl.NumberFormat("es-AR").format(r.trabajo.precio)} · {r.trabajo.terminado ? "marcado terminado" : "sin terminar"} ·{" "}
                  {r.trabajo.confirmado ? "confirmado" : "sin confirmar"}
                </p>
                {r.pago && (
                  <p className="mt-1">
                    <Estado tono={r.pago.estado === "en_disputa" ? "mal" : "neutro"}>
                      Pago {r.pago.modo} {r.pago.estado} · {r.pago.monto} {r.pago.moneda}
                    </Estado>
                  </p>
                )}
                <p className="mt-2 text-[15px] text-ink">“{r.detalle}”</p>
                {(r.fotos.length > 0 || r.trabajo.fotoDespues) && (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {r.trabajo.fotoDespues && <FotoPrivada secreto={secreto} id={r.trabajo.fotoDespues} alt="Foto del después que mandó el prestador" />}
                    {r.fotos.map((f: string, i: number) => (
                      <FotoPrivada key={f} secreto={secreto} id={f} alt={`Foto ${i + 1} del reclamo`} />
                    ))}
                  </div>
                )}
                <Conversacion mensajes={r.conversacion} />
                <input
                  className={`${claseCampo} mt-3`}
                  placeholder="Cómo se resolvió (lo ven las dos partes)"
                  value={motivos[r.id] ?? ""}
                  onChange={(e) => setMotivos({ ...motivos, [r.id]: e.target.value })}
                />
                <div className="mt-3">
                  <BotonSecundario disabled={ocupado || !motivos[r.id]} onClick={() => hacer({ accion: "reclamo", id: r.id, resolucion: motivos[r.id] })}>
                    Marcar resuelto
                  </BotonSecundario>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {vista === "metricas" && m && (
        <>
          <p className="mt-4 text-[13px] text-ink-500">Sin lo de muestra, sin los pedidos con presupuestos de muestra y sin lo de las pruebas automáticas.</p>
          <div className="mt-2 divide-y divide-line">
            {[
              ["Pedidos", String(m.pedidos)],
              ["Prestadores", String(m.prestadores)],
              ["Presupuestos", String(m.presupuestos)],
              ["Con presupuesto en menos de 1 h", m.conPresupuestoEnMenosDeUnaHora],
              ["Elegidos", m.elegidos],
              ["Pagados por la app (de los elegidos)", m.pagadosPorLaApp],
              ["Terminados (de los elegidos)", m.terminados],
              ["Vuelven a pedir", m.vuelvenAPedir],
              ["Cancelados", String(m.cancelados)],
            ].map(([nombre, valor]) => (
              <div key={nombre as string} className="flex min-h-14 items-center justify-between gap-4 py-2">
                <span className="text-[15px] text-ink-500">{nombre as string}</span>
                <span className="text-right text-[17px] font-bold text-ink">
                  {typeof valor === "string" ? valor : valor.porcentaje === null ? "—" : `${String(valor.porcentaje).replace(".", ",")} %`}
                  {typeof valor !== "string" && <span className="block text-xs font-medium text-ink-500">{valor.cantidad} de {valor.sobre}</span>}
                </span>
              </div>
            ))}
          </div>
          <Seccion>Pedidos por semana</Seccion>
          <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label="Pedidos por semana, las últimas 8">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {m.semanas.map((s: any) => {
              const maximo = Math.max(1, ...m.semanas.map((x: { pedidos: number }) => x.pedidos));
              return (
                <div key={s.desde} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-ink">{s.pedidos}</span>
                  <span className="w-full rounded-t bg-brand" style={{ height: `${(s.pedidos / maximo) * 88}px`, minHeight: 2 }} />
                  <span className="text-[10px] text-ink-500">{s.desde.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {vista === "demo" && datos.demo && (
        <>
          <p className="mt-4 text-[15px] text-ink-500">
            Barrio de demostración para el jurado: prestadores, vecinos, pedidos, chats y reseñas inventados. No cuenta en las métricas y no se
            cruza con lo real. Cuentas para entrar: vecina@necesitoya.demo y prestador@necesitoya.demo (contraseña demo2026).
          </p>
          <div className="mt-2 divide-y divide-line">
            {Object.entries(datos.demo as Record<string, number>).map(([k, v]) => (
              <div key={k} className="flex min-h-12 items-center justify-between py-2">
                <span className="text-[15px] capitalize text-ink-500">{k}</span>
                <span className="text-base font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <BotonSecundario
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("¿Cargar el barrio demo? Si ya hay uno, se reemplaza con fechas de hoy. No toca datos reales.")) void hacer({ accion: "cargar-demo", confirmar: true });
              }}
            >
              {datos.demo.pedidos > 0 ? "Volver a cargar el barrio demo" : "Cargar el barrio demo"}
            </BotonSecundario>
            {datos.demo.pedidos > 0 && (
              <BotonSecundario
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm("¿Borrar todo el barrio demo? No toca datos reales.")) void hacer({ accion: "borrar-demo", confirmar: true });
                }}
              >
                Borrar el barrio demo
              </BotonSecundario>
            )}
          </div>
        </>
      )}

      {vista === "pruebas" && datos.pruebas && (
        <>
          <p className="mt-4 text-[15px] text-ink-500">Lo que crearon las pruebas automáticas (cuentas con mail .test). Borrarlo no toca datos reales.</p>
          <div className="mt-2 divide-y divide-line">
            {Object.entries(datos.pruebas as Record<string, number>).map(([k, v]) => (
              <div key={k} className="flex min-h-12 items-center justify-between py-2">
                <span className="text-[15px] capitalize text-ink-500">{k}</span>
                <span className="text-base font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <BotonSecundario
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("¿Borrar todo lo que crearon las pruebas automáticas? No se puede deshacer.")) void hacer({ accion: "limpiar-pruebas", confirmar: true });
              }}
            >
              Borrar los datos de prueba
            </BotonSecundario>
          </div>
        </>
      )}
    </Pantalla>
  );
}
