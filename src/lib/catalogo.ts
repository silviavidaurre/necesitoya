// Rubros y zonas de NecesitoYa (San Salvador de Jujuy y Palpalá).
// Las "claves" van sin acentos y con ñ -> n, porque el texto se normaliza antes de comparar.

export const RUBROS = [
  { id: "plomeria", nombre: "Plomería", icono: "🔧", claves: ["plomer", "caner", "canilla", "destap", "sanitari", "termotanque"] },
  { id: "gas", nombre: "Gas", icono: "🔥", claves: ["gasista", "calefon", "estufa", "instalacion de gas", "instalaciones de gas"] },
  { id: "electricidad", nombre: "Electricidad", icono: "💡", claves: ["electricista", "electricidad", "cablead", "termica", "enchufe", "tablero"] },
  { id: "albanileria", nombre: "Albañilería", icono: "🧱", claves: ["albanil", "construccion", "revoque", "contrapiso", "ceramic", "losa", "techista"] },
  { id: "pintura", nombre: "Pintura", icono: "🎨", claves: ["pintor", "pintura", "pinto casas", "pintar"] },
  { id: "carpinteria", nombre: "Carpintería", icono: "🪚", claves: ["carpinter", "mueble", "madera"] },
  { id: "herreria", nombre: "Herrería", icono: "⚙️", claves: ["herrer", "soldad", "reja", "porton"] },
  { id: "aire", nombre: "Aire acondicionado", icono: "❄️", claves: ["aire acondicionado", "aires acondicionados", "split", "refrigeracion"] },
  { id: "electrodomesticos", nombre: "Electrodomésticos", icono: "🧺", claves: ["lavarropa", "heladera", "electrodomestic", "microondas"] },
  { id: "jardineria", nombre: "Jardín y terrenos", icono: "🌿", claves: ["jardin", "pasto", "cesped", "desmalez", "poda", "terreno"] },
  { id: "limpieza", nombre: "Limpieza", icono: "🧹", claves: ["limpieza", "limpio casas", "limpiar"] },
  { id: "mudanzas", nombre: "Fletes y mudanzas", icono: "🚚", claves: ["flete", "mudanza", "camioneta"] },
  { id: "cerrajeria", nombre: "Cerrajería", icono: "🔑", claves: ["cerrajer", "cerradura"] },
  { id: "otros", nombre: "Otros trabajos", icono: "🧰", claves: [] },
] as const;

export type RubroId = (typeof RUBROS)[number]["id"];

export const RUBRO_IDS = RUBROS.map((r) => r.id) as [RubroId, ...RubroId[]];

export const ZONAS = [
  "Centro",
  "Alto Comedero",
  "Los Perales",
  "Ciudad de Nieva",
  "Cuyaya",
  "San Pedrito",
  "Gorriti",
  "Mariano Moreno",
  "Chijra",
  "Bajo La Viña",
  "Alto La Viña",
  "Los Huaicos",
  "Malvinas",
  "Coronel Arias",
  "Luján",
  "Castañeda",
  "Sargento Cabral",
  "Almirante Brown",
  "Campo Verde",
  "Villa Jardín de Reyes",
  "Yala",
  "Palpalá",
] as const;

export function rubroPorId(id: string) {
  return RUBROS.find((r) => r.id === id) ?? RUBROS[RUBROS.length - 1];
}

export function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function pesos(n: number) {
  return "$" + new Intl.NumberFormat("es-AR").format(Math.round(n));
}

// Máximo de ofertas por pedido: el cliente compara pocas y cada prestador tiene chances reales.
export const MAX_OFERTAS = 3;
