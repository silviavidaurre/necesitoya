import { huella } from "./contrasenas";
import { nuevoId } from "./db";
import { diagnosticoBasico } from "./diagnostico";
import { hoyEnJujuy, sumarDias } from "./turnos";
import type { BaseDeDatos, Cuenta } from "./tipos";

// Cuentas para la revisión de Google Play: una de vecino y una de prestador verificado, con un pedido y un
// presupuesto de ejemplo (marcados `ejemplo`). Las cuentas llevan `revision: true` y lo suyo no cuenta en métricas.
// Volver a prepararlas deja todo como nuevo (por si el revisor borró la cuenta o cambió cosas).

export interface DatosDeRevision {
  vecino: { email: string; contrasena: string };
  prestador: { email: string; contrasena: string };
}

// La huella tarda: se calcula antes de tocar la base.
export async function huellasDeRevision(datos: DatosDeRevision) {
  const salVecino = nuevoId();
  const salPrestador = nuevoId();
  return {
    vecino: { email: datos.vecino.email, sal: salVecino, hash: await huella(datos.vecino.contrasena, salVecino) },
    prestador: { email: datos.prestador.email, sal: salPrestador, hash: await huella(datos.prestador.contrasena, salPrestador) },
  };
}

export function prepararRevision(db: BaseDeDatos, huellas: Awaited<ReturnType<typeof huellasDeRevision>>) {
  const ahora = new Date().toISOString();
  const cuenta = (email: string, sal: string, hash: string, nombre: string): Cuenta => {
    const sub = `mail:${email}`;
    db.cuentas = (db.cuentas ?? []).filter((c) => c.sub !== sub);
    const nueva: Cuenta = { sub, email, sal, hash, nombre, clave: nuevoId(), creado: ahora, revision: true };
    db.cuentas.push(nueva);
    return nueva;
  };
  const vecino = cuenta(huellas.vecino.email, huellas.vecino.sal, huellas.vecino.hash, "Vecina de prueba");
  const cuentaPrestador = cuenta(huellas.prestador.email, huellas.prestador.sal, huellas.prestador.hash, "Prestador de prueba");

  // Lo que quedó de una preparación anterior se saca, para empezar limpio.
  const viejos = new Set(db.prestadores.filter((p) => p.cuenta === cuentaPrestador.sub).map((p) => p.id));
  const pedidosViejos = new Set(db.pedidos.filter((p) => p.cuenta === vecino.sub).map((p) => p.id));
  const ofertasViejas = new Set(db.ofertas.filter((o) => viejos.has(o.prestadorId) || pedidosViejos.has(o.pedidoId)).map((o) => o.id));
  db.prestadores = db.prestadores.filter((p) => !viejos.has(p.id));
  db.verificaciones = (db.verificaciones ?? []).filter((v) => !viejos.has(v.prestadorId));
  db.pedidos = db.pedidos.filter((p) => !pedidosViejos.has(p.id));
  db.ofertas = db.ofertas.filter((o) => !ofertasViejas.has(o.id));
  db.mensajes = (db.mensajes ?? []).filter((m) => !ofertasViejas.has(m.ofertaId));

  const prestadorId = nuevoId();
  db.prestadores.push({
    id: prestadorId,
    idPublico: nuevoId(),
    nombre: "Prestador de prueba",
    rubros: ["plomeria", "gas"],
    zonas: ["Toda la ciudad"],
    aniosExperiencia: 10,
    descripcion: "Cuenta de prueba para la revisión de la app. Plomería y gas.",
    disponibilidad: "Todos los días",
    whatsapp: "",
    nivel: 3,
    transcripcion: "",
    creado: ahora,
    fotos: [],
    cuenta: cuentaPrestador.sub,
  });
  // Verificado con DNI y matrícula (trámites marcados como aprobados, sin fotos: es una cuenta de prueba).
  for (const tipo of ["dni", "matricula"] as const) {
    db.verificaciones = [...(db.verificaciones ?? []), { id: nuevoId(), prestadorId, tipo, documentos: [], estado: "aprobada", creado: ahora, revisado: ahora }];
  }

  const pedidoId = nuevoId();
  const titulo = "Ejemplo: pierde la canilla de la cocina";
  db.pedidos.push({
    id: pedidoId,
    titulo,
    descripcion: "Pedido de ejemplo para la revisión. Gotea todo el día aunque la cierre fuerte.",
    rubro: "plomeria",
    zona: "Centro",
    urgencia: "semana",
    precioMin: 25000,
    precioMax: 45000,
    diagnostico: diagnosticoBasico("plomeria", titulo),
    clienteNombre: "Vecina de prueba",
    ejemplo: true,
    estado: "abierto",
    creado: ahora,
    claveCliente: nuevoId(),
    cuenta: vecino.sub,
  });
  const hoy = hoyEnJujuy();
  db.ofertas.push({
    id: nuevoId(),
    pedidoId,
    prestadorId,
    precio: 35000,
    cuando: "Mañana",
    turnos: [
      { dia: sumarDias(hoy, 1), franja: "manana" },
      { dia: sumarDias(hoy, 1), franja: "tarde" },
    ],
    mensaje: "Presupuesto de ejemplo para la revisión.",
    estado: "enviada",
    creado: ahora,
    ejemplo: true,
  });
  return { vecino: vecino.email, prestador: cuentaPrestador.email };
}

// Las cuentas de revisión, para dejarlas afuera de las métricas.
export function cuentasDeRevision(db: BaseDeDatos) {
  return new Set((db.cuentas ?? []).filter((c) => c.revision).map((c) => c.sub));
}
