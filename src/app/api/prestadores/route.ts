import { RUBRO_IDS, type RubroId } from "@/lib/catalogo";
import { cuentaDe, dentroDelCupo, dentroDelCupoDe, leer, modificar, nuevoId } from "@/lib/db";
import { billeteraValida } from "@/lib/stellar";
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
  return Response.json({ prestador: perfilPropio(prestador), reputacion: reputacionDe(db, prestador.id) });
}

// El perfil propio tal como lo ve su dueño: sin el identificador de la cuenta (puede ser un mail).
function perfilPropio(prestador: Prestador) {
  const { cuenta, idCliente: _intento, mercadopago, ...resto } = prestador;
  return { ...resto, conCuenta: Boolean(cuenta), conMercadoPago: Boolean(mercadopago) };
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

  // La billetera Stellar es opcional: sin ella se cobra por fuera de la app. Vacía la borra.
  const billeteraCruda = texto(cuerpo.billetera, 60).toUpperCase();
  if (billeteraCruda && !billeteraValida(billeteraCruda)) {
    return Response.json({ error: "La billetera tiene que ser una dirección Stellar que empieza con G (56 caracteres)." }, { status: 400 });
  }

  const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
  if (id) {
    const actualizado = await modificar((db) => {
      const existente = db.prestadores.find((p) => p.id === id);
      if (!existente) return null;
      Object.assign(existente, cambios);
      // Solo se toca si vino el campo: una app vieja que no lo manda no la borra.
      if (typeof cuerpo.billetera === "string") existente.billetera = billeteraCruda || undefined;
      return existente;
    });
    if (!actualizado) return Response.json({ error: "No encontramos ese perfil." }, { status: 404 });
    return Response.json({ prestador: perfilPropio(actualizado) });
  }

  // Para anotarse hace falta una cuenta (mail o Google): una cuenta, un perfil.
  const db = await leer();
  const cuenta = cuentaDe(db, cuerpo.cuenta);
  if (!cuenta) return Response.json({ error: "Entrá con tu cuenta para anotarte." }, { status: 401 });
  const idCliente = texto(cuerpo.idCliente, 64) || undefined;
  const yaTiene = db.prestadores.find((p) => p.cuenta === cuenta);
  if (yaTiene && !(idCliente && yaTiene.idCliente === idCliente)) {
    return Response.json({ error: "Esta cuenta ya tiene un perfil de prestador. Entrá con ella y lo vas a ver." }, { status: 409 });
  }

  if (!(await dentroDelCupo("prestadores")) || !(await dentroDelCupoDe("prestadores", cuenta))) {
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
    idCliente,
    cuenta,
    billetera: billeteraCruda || undefined,
  };

  // Mismo intento que llega dos veces (se perdió la respuesta y el celular reintentó): se devuelve el que ya existe.
  const guardado = await modificar((db) => {
    const repetido = prestador.idCliente ? db.prestadores.find((p) => p.idCliente === prestador.idCliente) : undefined;
    if (repetido) return repetido;
    if (db.prestadores.some((p) => p.cuenta === cuenta)) return null;
    db.prestadores.push(prestador);
    return prestador;
  });
  if (!guardado) return Response.json({ error: "Esta cuenta ya tiene un perfil de prestador." }, { status: 409 });

  return Response.json({ prestador: perfilPropio(guardado) }, { status: 201 });
}
