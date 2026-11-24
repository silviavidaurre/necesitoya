// Ayudas del lado del navegador: lo que este celular recuerda y cómo se habla con el servidor.

function leerJson<T>(almacen: "local" | "sesion", clave: string, porDefecto: T): T {
  try {
    const crudo = (almacen === "local" ? window.localStorage : window.sessionStorage).getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJson(almacen: "local" | "sesion", clave: string, valor: unknown) {
  try {
    const destino = almacen === "local" ? window.localStorage : window.sessionStorage;
    if (valor === null) destino.removeItem(clave);
    else destino.setItem(clave, JSON.stringify(valor));
  } catch {
    // Si el navegador bloquea el almacenamiento, la app sigue andando; solo no recuerda.
  }
}

// --- Prestador: quién es en este dispositivo -------------------------------------------------

const CLAVE = "necesitoya.prestadorId";

export function leerPrestadorId(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarPrestadorId(id: string) {
  try {
    window.localStorage.setItem(CLAVE, id);
  } catch {
    // El alta igual quedó guardada en el servidor.
  }
}

export function borrarPrestadorId() {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // Nada que limpiar.
  }
}

// --- Vecino: sus datos y sus pedidos ---------------------------------------------------------

// Lo que no hay que volver a preguntar: barrio y nombre de la última vez. El teléfono no se pide ni se guarda.
export interface MisDatos {
  zona: string;
  nombre: string;
}

export function leerMisDatos(): MisDatos {
  const datos = leerJson<Partial<MisDatos>>("local", "necesitoya.misDatos", {});
  return { zona: datos.zona ?? "", nombre: datos.nombre ?? "" };
}

export function guardarMisDatos(datos: Partial<MisDatos>) {
  guardarJson("local", "necesitoya.misDatos", { ...leerMisDatos(), ...datos });
}

// El pedido a medio armar: si se recarga la página o se toca atrás por error, no se pierde lo contado.
export interface BorradorDePedido {
  relato: string;
  porVoz: boolean;
}

export function leerBorrador(): BorradorDePedido | null {
  return leerJson<BorradorDePedido | null>("sesion", "necesitoya.borrador", null);
}

export function guardarBorrador(borrador: BorradorDePedido | null) {
  guardarJson("sesion", "necesitoya.borrador", borrador);
}

// Pedidos que este vecino publicó desde este dispositivo, con la clave para seguirlos.
export interface PedidoGuardado {
  id: string;
  clave: string;
  titulo: string;
  creado: string;
}

export function leerMisPedidos(): PedidoGuardado[] {
  const lista = leerJson<PedidoGuardado[]>("local", "necesitoya.misPedidos", []);
  return Array.isArray(lista) ? lista : [];
}

// Al entrar a una cuenta o salir de ella, la lista pasa a ser la de esa cuenta (o queda vacía).
export function reemplazarMisPedidos(pedidos: PedidoGuardado[]) {
  guardarJson("local", "necesitoya.misPedidos", pedidos.slice(0, 20));
}

export function guardarMiPedido(pedido: PedidoGuardado) {
  const otros = leerMisPedidos().filter((p) => p.id !== pedido.id);
  guardarJson("local", "necesitoya.misPedidos", [pedido, ...otros].slice(0, 20));
}

// --- Cuenta de Google (opcional) ---------------------------------------------------------------

// La cuenta abierta en este celular (con mail o con Google). La clave une a la cuenta lo que se cree después.
export interface CuentaGuardada {
  nombre: string;
  clave: string;
}

export function leerCuenta(): CuentaGuardada | null {
  const cuenta = leerJson<CuentaGuardada | null>("local", "necesitoya.cuenta", null);
  return cuenta && typeof cuenta.clave === "string" ? cuenta : null;
}

export function guardarCuenta(cuenta: CuentaGuardada | null) {
  guardarJson("local", "necesitoya.cuenta", cuenta);
}

// --- Celular del prestador (opcional) ----------------------------------------------------------

// Lleva un celular argentino cargado de cualquier forma (388 412-3456, 0388 15 4123456, +54 9 388...)
// a sus 10 dígitos: característica + número, sin 0 ni 15. Devuelve null si no es un número completo.
export function numeroNacional(numero: string): string | null {
  let digitos = numero.replace(/\D/g, "");
  if (digitos.startsWith("549")) digitos = digitos.slice(3);
  else if (digitos.startsWith("54")) digitos = digitos.slice(2);
  digitos = digitos.replace(/^0+/, "");
  if (digitos.length === 12) {
    // Tiene el 15 después de la característica (de 2, 3 o 4 dígitos). Se prueba primero con 3, que es el caso de Jujuy.
    for (const largo of [3, 4, 2]) {
      if (digitos.slice(largo, largo + 2) === "15") {
        digitos = digitos.slice(0, largo) + digitos.slice(largo + 2);
        break;
      }
    }
  }
  return digitos.length === 10 ? digitos : null;
}

// --- Pedidos al servidor ----------------------------------------------------------------------

// `estado` es el código que devolvió el servidor, o 0 cuando ni siquiera hubo respuesta (sin señal o tardó demasiado).
export class ErrorDePedido extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

// `espera` es el tiempo máximo en milisegundos. Con mala señal es mejor avisar y dejar reintentar
// que dejar una rueda girando para siempre.
export async function pedir<T>(url: string, opciones?: RequestInit & { espera?: number }): Promise<T> {
  const { espera = 25_000, ...resto } = opciones ?? {};
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), espera);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      ...resto,
      headers: { "Content-Type": "application/json", ...(resto.headers ?? {}) },
      cache: "no-store",
      signal: corte.signal,
    });
  } catch {
    throw new ErrorDePedido("No hay señal o está tardando mucho. Probá de nuevo.", 0);
  } finally {
    clearTimeout(reloj);
  }

  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorDePedido(cuerpo?.error ?? "Algo salió mal. Probá de nuevo.", respuesta.status);
  }
  if (cuerpo === null) throw new ErrorDePedido("No hay señal o está tardando mucho. Probá de nuevo.", 0);
  return cuerpo as T;
}
