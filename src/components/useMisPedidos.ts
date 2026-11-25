import { useEffect, useState } from "react";
import { rubroPorId, type RubroId } from "@/lib/catalogo";
import { ErrorDePedido, leerMisPedidos, pedir, type PedidoGuardado } from "@/lib/cliente";
import { fechaCorta } from "@/lib/fechas";
import type { Seguimiento } from "@/lib/seguimiento";
import { textoDeTurno } from "@/lib/turnos";

export type EstadoDeMiPedido = "buscando" | "para-elegir" | "en-curso" | "terminado" | "cancelado" | "sin-datos";

// Un pedido guardado en este celular, con lo que dice la API de cómo va. Sin datos (sin señal, o ya no existe)
// queda "sin-datos" y se muestra igual, para poder abrirlo.
export interface MiPedido extends PedidoGuardado {
  datos: Seguimiento | null;
  rubro: RubroId | null;
  estado: EstadoDeMiPedido;
  // "3 presupuestos para elegir", "Ramón está en camino", "Terminado · 12 nov".
  texto: string;
  // Verde = hay algo para hacer y está bien (presupuestos para elegir); acento = trabajo en vivo.
  tono: "bien" | "acento" | "neutro";
  // Mensajes del chat sin leer, sumando todos los presupuestos.
  sinLeer: number;
}

const pilaDe = (nombre: string) => nombre.split(" ")[0];

export function resumirPedido(guardado: PedidoGuardado, datos: Seguimiento | null): MiPedido {
  const base = { ...guardado, datos, rubro: null, sinLeer: 0 };
  if (!datos) return { ...base, estado: "sin-datos", texto: "Ver cómo va", tono: "neutro" };
  const { pedido, ofertas } = datos;
  const comun = { ...base, titulo: pedido.titulo, rubro: pedido.rubro, sinLeer: ofertas.reduce((s, o) => s + o.sinLeer, 0) };
  if (pedido.estado === "cancelado") return { ...comun, estado: "cancelado", texto: "Cancelado", tono: "neutro" };
  const elegida = ofertas.find((o) => o.estado === "elegida");
  if (elegida) {
    const pila = pilaDe(elegida.prestador.nombre);
    if (pedido.confirmado) return { ...comun, estado: "terminado", texto: `Terminado · ${fechaCorta(pedido.confirmado)}`, tono: "neutro" };
    if (elegida.prestador.ejemplo) return { ...comun, estado: "terminado", texto: "De muestra", tono: "neutro" };
    if (elegida.terminado) return { ...comun, estado: "en-curso", texto: `${pila} terminó · confirmá que quedó bien`, tono: "bien" };
    const estado = elegida.trabajo?.estado ?? "confirmado";
    const turno = elegida.trabajo?.turno;
    const texto =
      estado === "en_camino"
        ? `${pila} está en camino`
        : estado === "llego"
          ? `${pila} llegó`
          : estado === "trabajando"
            ? `${pila} está trabajando`
            : `Con ${pila}${turno ? ` · ${textoDeTurno(turno)}` : ""}`;
    return { ...comun, estado: "en-curso", texto, tono: estado === "confirmado" ? "neutro" : "acento" };
  }
  if (ofertas.length > 0) {
    return { ...comun, estado: "para-elegir", texto: `${ofertas.length} ${ofertas.length === 1 ? "presupuesto para elegir" : "presupuestos para elegir"}`, tono: "bien" };
  }
  return { ...comun, estado: "buscando", texto: "Buscando presupuestos", tono: "neutro" };
}

// El ícono del oficio del pedido (o uno genérico mientras no se sabe).
export function iconoDe(pedido: MiPedido) {
  return pedido.rubro ? rubroPorId(pedido.rubro).id : "lista";
}

// Los pedidos que este celular tiene guardados (los últimos `limite`), con su estado. Los muestra enseguida con
// "Ver cómo va" y los completa a medida que responde la API (un pedido por consulta, la misma que usa el seguimiento).
export function useMisPedidos(limite = 20) {
  const [pedidos, setPedidos] = useState<MiPedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinActualizar, setSinActualizar] = useState(0);

  useEffect(() => {
    let vigente = true;
    const guardados = leerMisPedidos().slice(0, limite);
    setPedidos(guardados.map((g) => resumirPedido(g, null)));
    if (guardados.length === 0) {
      setCargando(false);
      return;
    }
    // Cada pedido se completa apenas llega su respuesta: uno lento (o sin señal) no frena a los demás.
    let fallas = 0;
    void Promise.all(
      guardados.map((g) =>
        pedir<Seguimiento>(`/api/pedido?id=${encodeURIComponent(g.id)}&clave=${encodeURIComponent(g.clave)}`)
          .then((datos) => {
            if (vigente) setPedidos((antes) => antes.map((p) => (p.id === g.id ? resumirPedido(g, datos) : p)));
          })
          .catch((e) => {
            // Borrado o de otra cuenta: no es falta de señal, se dice que ya no está.
            if (e instanceof ErrorDePedido && (e.estado === 404 || e.estado === 403)) {
              if (vigente) setPedidos((antes) => antes.map((p) => (p.id === g.id ? { ...p, texto: "Ya no está disponible" } : p)));
            } else fallas += 1;
          }),
      ),
    ).then(() => {
      if (!vigente) return;
      setSinActualizar(fallas);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [limite]);

  // sinActualizar: cuántos no se pudieron traer (sin señal, o el pedido ya no existe).
  return { pedidos, cargando, sinActualizar };
}
