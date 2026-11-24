import { MAX_OFERTAS } from "./catalogo";
import type { BaseDeDatos, Pedido, PerfilPublico, Prestador, Reputacion, Resena } from "./tipos";

// Reglas de negocio compartidas por las rutas de la API.

// Cuánto tiempo el último lugar de un pedido queda guardado para prestadores que trabajan en ese barrio.
// Sale de una queja repetida de los técnicos en otras apps: el cupo se llena en segundos y gana siempre el más rápido.
export const RESERVA_MINUTOS = 15;
export const MAX_FOTOS = 3;

export function cubreZona(prestador: Prestador, zona: string) {
  return prestador.zonas.includes(zona) || prestador.zonas.includes("Toda la ciudad");
}

// Minutos que faltan para que el último lugar se abra a todos. 0 si no hay lugar reservado en este momento.
export function minutosDeReserva(pedido: Pedido, ofertasRecibidas: number, ahora = Date.now()) {
  if (pedido.ejemplo || ofertasRecibidas !== MAX_OFERTAS - 1) return 0;
  const restante = RESERVA_MINUTOS * 60_000 - (ahora - Date.parse(pedido.creado));
  return restante > 0 ? Math.ceil(restante / 60_000) : 0;
}

export function reputacionDe(db: BaseDeDatos, prestadorId: string): Reputacion {
  const elegidas = db.ofertas.filter((o) => o.prestadorId === prestadorId && o.estado === "elegida");
  const notas = elegidas
    .map((o) => db.pedidos.find((p) => p.id === o.pedidoId)?.calificacion?.estrellas)
    .filter((n): n is number => typeof n === "number");
  const suma = notas.reduce((total, n) => total + n, 0);
  return {
    trabajos: elegidas.length,
    calificaciones: notas.length,
    promedio: notas.length > 0 ? Math.round((suma / notas.length) * 10) / 10 : null,
  };
}

export function resenasDe(db: BaseDeDatos, prestadorId: string): Resena[] {
  return db.ofertas
    .filter((o) => o.prestadorId === prestadorId && o.estado === "elegida")
    .flatMap((o) => {
      const pedido = db.pedidos.find((p) => p.id === o.pedidoId);
      if (!pedido?.calificacion) return [];
      return [
        {
          estrellas: pedido.calificacion.estrellas,
          comentario: pedido.calificacion.comentario,
          // Solo el nombre de pila del vecino.
          cliente: pedido.clienteNombre.split(" ")[0],
          trabajo: pedido.titulo,
          creado: pedido.calificacion.creado,
        },
      ];
    })
    .sort((a, b) => b.creado.localeCompare(a.creado))
    .slice(0, 10);
}

export function perfilPublico(db: BaseDeDatos, prestador: Prestador): PerfilPublico {
  return {
    // Nunca el id secreto: quien ve esta ficha no puede usarla para entrar al perfil.
    id: prestador.idPublico,
    nombre: prestador.nombre,
    rubros: prestador.rubros,
    zonas: prestador.zonas,
    aniosExperiencia: prestador.aniosExperiencia,
    descripcion: prestador.descripcion,
    disponibilidad: prestador.disponibilidad,
    nivel: prestador.nivel,
    fotos: prestador.fotos ?? [],
    reputacion: reputacionDe(db, prestador.id),
    resenas: resenasDe(db, prestador.id),
    ejemplo: Boolean(prestador.ejemplo),
  };
}
