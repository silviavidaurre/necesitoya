import type { BaseDeDatos, Pedido, PedidoPublico, Prestador } from "./tipos";

// Puerta única a los datos. El almacén real se elige al arrancar el servidor:
// un archivo JSON en desarrollo (servidor/almacen-archivo.ts) o una base D1 en Cloudflare
// (servidor/almacen-d1.ts). El resto de la app solo usa leer() y modificar().

export interface Foto {
  tipo: string;
  base64: string;
}

export interface Almacen {
  leer(): Promise<BaseDeDatos>;
  modificar<T>(cambio: (db: BaseDeDatos) => T): Promise<T>;
  // Las fotos van aparte del resto de los datos para no engordar cada lectura.
  guardarFoto(id: string, foto: Foto): Promise<void>;
  leerFoto(id: string): Promise<Foto | null>;
  // Suma uno al contador de hoy para ese nombre y devuelve cuánto lleva.
  consumirCupo(nombre: string): Promise<number>;
}

let almacen: Almacen | null = null;

export function usarAlmacen(nuevo: Almacen) {
  almacen = nuevo;
}

function actual(): Almacen {
  if (!almacen) throw new Error("El almacén de datos no está configurado.");
  return almacen;
}

// Perfiles creados antes de que existiera el id público: se les asigna uno. Devuelve true si cambió algo.
function completarIdsPublicos(db: BaseDeDatos) {
  let cambio = false;
  for (const prestador of db.prestadores) {
    if (!prestador.idPublico) {
      prestador.idPublico = nuevoId();
      cambio = true;
    }
  }
  return cambio;
}

export async function leer(): Promise<BaseDeDatos> {
  const db = await actual().leer();
  if (!db.prestadores.some((p) => !p.idPublico)) return db;
  // Hay que guardarlo: si se asignara solo en memoria, el id cambiaría en cada lectura.
  return actual().modificar((fresco) => {
    completarIdsPublicos(fresco);
    return fresco;
  });
}

export function modificar<T>(cambio: (db: BaseDeDatos) => T): Promise<T> {
  return actual().modificar((db) => {
    completarIdsPublicos(db);
    return cambio(db);
  });
}

export function guardarFoto(id: string, foto: Foto): Promise<void> {
  return actual().guardarFoto(id, foto);
}

export function leerFoto(id: string): Promise<Foto | null> {
  return actual().leerFoto(id);
}

// Topes diarios para todo lo que cuesta plata o llena la base. Son globales (no por persona) porque en un
// evento todos comparten la misma conexión; su trabajo es que un abuso no vacíe las cuentas ni rompa la app.
export const CUPOS = {
  ia: 1500,
  voz: 1200,
  pedidos: 400,
  prestadores: 300,
  ofertas: 1500,
  fotos: 500,
  cuentas: 3000,
  mensajes: 6000,
} as const;

// true si todavía hay cupo para hoy. Cuenta el intento aunque después falle, a propósito.
export async function dentroDelCupo(nombre: keyof typeof CUPOS): Promise<boolean> {
  try {
    return (await actual().consumirCupo(nombre)) <= CUPOS[nombre];
  } catch (error) {
    // Si el contador falla no se bloquea a nadie: es una protección, no una función de la app.
    console.error("[cupo]", error);
    return true;
  }
}

export function nuevoId() {
  return crypto.randomUUID();
}

// Quita del pedido lo privado: el teléfono (si quedó de antes) y la clave de seguimiento.
// Del nombre del vecino solo queda el de pila: la lista de pedidos la puede leer cualquiera.
export function pedidoPublico(pedido: Pedido): PedidoPublico {
  const { clienteWhatsapp: _whatsapp, claveCliente: _clave, idCliente: _intento, cuenta: _cuenta, ...publico } = pedido;
  return { ...publico, clienteNombre: pedido.clienteNombre.split(" ")[0] };
}

// La cuenta de Google que corresponde a la llave que manda el celular, o nada si no entró con Google.
export function cuentaDe(db: BaseDeDatos, clave: unknown): string | undefined {
  if (typeof clave !== "string" || clave.length < 10) return undefined;
  return db.cuentas?.find((c) => c.clave === clave)?.sub;
}

// Pedidos de muestra para que el prestador vea cómo funciona. Van marcados como ejemplo
// y no se cuentan en las métricas de uso real.
function pedidosDeEjemplo(): Pedido[] {
  const ahora = Date.now();
  const base: Omit<Pedido, "id" | "creado" | "ejemplo" | "estado" | "clienteNombre">[] = [
    { titulo: "Pierde agua la canilla de la cocina", descripcion: "Gotea todo el día aunque la cierre fuerte. Es una canilla monocomando.", rubro: "plomeria", zona: "Alto Comedero", urgencia: "hoy", precioMin: 25000, precioMax: 45000 },
    { titulo: "Se corta la luz cuando prendo el horno", descripcion: "Salta la térmica cada vez que enchufo el horno eléctrico. Casa de una planta.", rubro: "electricidad", zona: "Los Perales", urgencia: "hoy", precioMin: 30000, precioMax: 60000 },
    { titulo: "El calefón no enciende", descripcion: "Calefón a gas de 14 litros, hace chispa pero no prende la llama.", rubro: "gas", zona: "Cuyaya", urgencia: "hoy", precioMin: 40000, precioMax: 70000 },
    { titulo: "Instalar un split de 3000 frigorías", descripcion: "Ya tengo el equipo. Es en un primer piso, la unidad exterior va al balcón.", rubro: "aire", zona: "Ciudad de Nieva", urgencia: "semana", precioMin: 110000, precioMax: 150000 },
    { titulo: "Cortar el pasto y desmalezar un terreno", descripcion: "Terreno de 10 x 30 metros con yuyos altos. Hay que llevarse lo cortado.", rubro: "jardineria", zona: "Chijra", urgencia: "semana", precioMin: 40000, precioMax: 70000 },
    { titulo: "Flete de una heladera y un lavarropas", descripcion: "Desde el Centro hasta Alto Comedero. Planta baja en los dos lugares.", rubro: "mudanzas", zona: "Centro", urgencia: "semana", precioMin: 25000, precioMax: 40000 },
    { titulo: "Pintar dos habitaciones", descripcion: "Dos piezas de 3 x 3 metros, paredes y techo. Yo pongo la pintura.", rubro: "pintura", zona: "Palpalá", urgencia: "flexible", precioMin: 180000, precioMax: 260000 },
    { titulo: "Revocar una pared de 12 m²", descripcion: "Pared de ladrillo hueco en el patio, revoque grueso y fino.", rubro: "albanileria", zona: "San Pedrito", urgencia: "flexible", precioMin: 150000, precioMax: 220000 },
  ];
  return base.map((p, i) => ({
    ...p,
    id: nuevoId(),
    clienteNombre: "Pedido de ejemplo",
    ejemplo: true,
    estado: "abierto",
    creado: new Date(ahora - i * 17 * 60 * 1000).toISOString(),
  }));
}

// Prestadores de muestra: sirven para ver cómo se ve un pedido con presupuestos sin tener un segundo celular.
// Son personas inventadas, van marcados con `ejemplo`, no tienen WhatsApp y no cuentan en las métricas.
export function prestadoresDeMuestra(): Prestador[] {
  const base: Pick<Prestador, "nombre" | "rubros" | "zonas" | "aniosExperiencia" | "descripcion" | "disponibilidad">[] = [
    { nombre: "Ramón Quispe", rubros: ["plomeria", "gas"], zonas: ["Alto Comedero", "Cuyaya", "Centro"], aniosExperiencia: 12, descripcion: "Hago destapaciones, instalaciones de agua y gas, y arreglo termotanques y calefones.", disponibilidad: "Lunes a sábado" },
    { nombre: "Marta Flores", rubros: ["electricidad", "aire", "electrodomesticos"], zonas: ["Ciudad de Nieva", "Los Perales", "Centro"], aniosExperiencia: 8, descripcion: "Instalaciones eléctricas, tableros, aires acondicionados y arreglo de lavarropas.", disponibilidad: "Lunes a viernes" },
    { nombre: "Daniel Cruz", rubros: ["albanileria", "pintura", "herreria"], zonas: ["Toda la ciudad"], aniosExperiencia: 15, descripcion: "Albañilería en general, revoques, pintura de interiores y exteriores, rejas y portones.", disponibilidad: "Todos los días" },
    { nombre: "Lucía Mamaní", rubros: ["limpieza", "jardineria", "otros"], zonas: ["Palpalá", "Alto Comedero", "San Pedrito"], aniosExperiencia: 5, descripcion: "Limpieza de casas y terrenos, corte de pasto y desmalezado.", disponibilidad: "Lunes a sábado por la mañana" },
    { nombre: "Hugo Tolaba", rubros: ["mudanzas", "carpinteria", "cerrajeria"], zonas: ["Toda la ciudad"], aniosExperiencia: 10, descripcion: "Fletes y mudanzas con camioneta, armado de muebles y cambio de cerraduras.", disponibilidad: "Todos los días" },
  ];
  return base.map((p) => ({
    ...p,
    id: nuevoId(),
    idPublico: nuevoId(),
    whatsapp: "",
    nivel: 1,
    transcripcion: "",
    creado: new Date().toISOString(),
    fotos: [],
    ejemplo: true,
  }));
}

// Bases creadas antes de que existieran los prestadores de muestra: se los agrega. Devuelve los de muestra.
export function asegurarPrestadoresDeMuestra(db: BaseDeDatos): Prestador[] {
  if (!db.prestadores.some((p) => p.ejemplo)) db.prestadores.push(...prestadoresDeMuestra());
  return db.prestadores.filter((p) => p.ejemplo);
}

export function baseInicial(): BaseDeDatos {
  return { prestadores: prestadoresDeMuestra(), pedidos: pedidosDeEjemplo(), ofertas: [] };
}
