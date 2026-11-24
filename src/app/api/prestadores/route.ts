import { RUBRO_IDS, type RubroId } from "@/lib/catalogo";
import { cuentaDe, dentroDelCupo, leer, modificar, nuevoId } from "@/lib/db";
import { reputacionDe } from "@/lib/reglas";
import { limpiarLista, limpiarTexto as texto } from "@/lib/texto";
import type { Prestador } from "@/lib/tipos";

// El perfil propio, con su celular si lo cargó. El id es un UUID que solo conoce el celular donde se creó el perfil.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el id." }, { status: 400 });

  const db = await leer();
  const prestador = db.prestadores.find((p) => p.id === id);
  if (!prestador) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
  return Response.json({ prestador, reputacion: reputacionDe(db, prestador.id) });
}

// Crea un perfil nuevo o, si viene el id, guarda los cambios del existente.
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const nombre = texto(cuerpo.nombre, 80);
  const rubros = limpiarLista(cuerpo.rubros, 8, 40).filter((r): r is RubroId => (RUBRO_IDS as string[]).includes(r));
  const zonas = limpiarLista(cuerpo.zonas, 12, 60);
  const whatsapp = texto(cuerpo.whatsapp, 30).replace(/[^\d+]/g, "");
  const aniosCrudos = Number(cuerpo.aniosExperiencia);
  const anios = Number.isFinite(aniosCrudos) ? Math.max(0, Math.min(70, Math.round(aniosCrudos))) : 0;

  if (nombre.length < 2) return Response.json({ error: "Falta tu nombre." }, { status: 400 });
  if (rubros.length === 0) return Response.json({ error: "Elegí al menos un oficio." }, { status: 400 });
  // El celular es opcional y no se le muestra a nadie. Si lo carga, tiene que estar completo.
  if (whatsapp && whatsapp.replace(/\D/g, "").length < 8) {
    return Response.json({ error: "Si cargás tu celular, escribilo completo, con la característica." }, { status: 400 });
  }

  const cambios = {
    nombre,
    rubros,
    zonas,
    aniosExperiencia: anios,
    descripcion: texto(cuerpo.descripcion, 400),
    disponibilidad: texto(cuerpo.disponibilidad, 120),
    whatsapp,
  };

  const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
  if (id) {
    const actualizado = await modificar((db) => {
      const existente = db.prestadores.find((p) => p.id === id);
      if (!existente) return null;
      Object.assign(existente, cambios);
      return existente;
    });
    if (!actualizado) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
    return Response.json({ prestador: actualizado });
  }

  if (!(await dentroDelCupo("prestadores"))) {
    return Response.json({ error: "Hoy se anotó demasiada gente. Probá de nuevo mañana." }, { status: 429 });
  }

  const prestador: Prestador = {
    ...cambios,
    id: nuevoId(),
    idPublico: nuevoId(),
    nivel: 1,
    // El relato original no se guarda: ya quedó volcado en el perfil y no hace falta conservarlo.
    transcripcion: "",
    creado: new Date().toISOString(),
    fotos: [],
    idCliente: texto(cuerpo.idCliente, 64) || undefined,
  };

  // Mismo intento que llega dos veces (se perdió la respuesta y el celular reintentó): se devuelve el que ya existe.
  const guardado = await modificar((db) => {
    const repetido = prestador.idCliente ? db.prestadores.find((p) => p.idCliente === prestador.idCliente) : undefined;
    if (repetido) return repetido;
    const cuenta = cuentaDe(db, cuerpo.cuenta);
    // Una cuenta, un perfil: si ya tiene uno unido, el nuevo queda solo en este celular.
    if (cuenta && !db.prestadores.some((p) => p.cuenta === cuenta)) prestador.cuenta = cuenta;
    db.prestadores.push(prestador);
    return prestador;
  });

  return Response.json({ prestador: guardado }, { status: 201 });
}
