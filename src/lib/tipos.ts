import type { RubroId } from "./catalogo";

export type Urgencia = "hoy" | "semana" | "flexible";

export type Riesgo = "bajo" | "medio" | "alto";

// Orientación de la IA sobre el problema, antes de que vaya el prestador. Es orientativa: no reemplaza la visita.
export interface Diagnostico {
  // La causa más probable, dicha como probabilidad ("lo más probable es que...").
  causa: string;
  riesgo: Riesgo;
  queHacerYa: string[];
  materiales: string[];
  // Preguntas que conviene hacerle al prestador antes de elegirlo.
  preguntas: string[];
  // Gas o electricidad: siempre hace falta un matriculado. "" si no aplica.
  matriculado: "" | "gasista" | "electricista";
  // Pasos de seguridad para hacer ya (gas o electricidad). Van antes que el resto.
  seguridad: string[];
}

export interface PerfilBorrador {
  nombre: string;
  rubros: RubroId[];
  zonas: string[];
  aniosExperiencia: number;
  descripcion: string;
  disponibilidad: string;
}

export interface Prestador extends PerfilBorrador {
  // Secreto: solo lo conoce el celular donde se creó el perfil. Sirve como llave para leerlo y editarlo,
  // así que NUNCA sale en respuestas que ve otra persona.
  id: string;
  // El que se muestra: va en el enlace del perfil público y en los presupuestos que ve el vecino.
  idPublico: string;
  // Opcional y privado: no se le muestra a nadie. Vacío si no lo cargó.
  whatsapp: string;
  // 1: celular cargado · 2: DNI verificado · 3: oficio certificado (curso o matrícula)
  nivel: 1 | 2 | 3;
  transcripcion: string;
  creado: string;
  // Fotos de trabajos hechos (ids en el almacén de fotos). Hasta 3.
  fotos?: string[];
  // true = prestador de muestra, inventado para probar la app. No tiene WhatsApp ni cuenta en las métricas.
  ejemplo?: boolean;
  // Identificador del intento de alta, generado en el celular: evita perfiles duplicados al reintentar.
  idCliente?: string;
  // Cuenta a la que quedó unido. Sirve para recuperarlo en otro celular. Privado.
  cuenta?: string;
  // Billetera Stellar (G...) donde cobra los pagos protegidos. Privada: solo la usa el servidor para armar el pago.
  billetera?: string;
  // true = moderación lo sacó de la vista (por denuncias). No aparece en presupuestos nuevos.
  suspendido?: boolean;
  // Solo en la respuesta del perfil propio: si está unido a una cuenta (no se guarda).
  conCuenta?: boolean;
}

// Lo que el vecino opinó del trabajo una vez hecho.
export interface Calificacion {
  estrellas: number;
  comentario: string;
  creado: string;
}

// Lo que la IA arma a partir del relato (y la foto) del vecino, antes de que lo revise y publique.
export interface PedidoBorrador {
  titulo: string;
  descripcion: string;
  rubro: RubroId;
  urgencia: Urgencia;
  precioMin: number | null;
  precioMax: number | null;
  diagnostico?: Diagnostico | null;
}

export interface Pedido extends PedidoBorrador {
  id: string;
  zona: string;
  clienteNombre: string;
  // true = pedido de muestra cargado por nosotros, no cuenta como uso real.
  ejemplo: boolean;
  // abierto: recibe presupuestos · cerrado: ya eligió uno · cancelado: el vecino lo dio de baja.
  estado: "abierto" | "cerrado" | "cancelado";
  creado: string;
  // Lo que el vecino dijo o escribió, sin tocar. El técnico lo ve junto al resumen de la IA.
  relato?: string;
  fotoId?: string | null;
  calificacion?: Calificacion | null;
  // true = el vecino pidió ver presupuestos de muestra en este pedido; deja de contar como uso real.
  conMuestra?: boolean;
  // Privados: no salen en ninguna respuesta. El teléfono ya no se pide (quedó en pedidos viejos).
  clienteWhatsapp?: string;
  claveCliente?: string;
  // Identificador del intento, generado en el celular: si llega dos veces el mismo, no se duplica el pedido.
  idCliente?: string;
  // Cuenta del vecino. Privado.
  cuenta?: string;
  // Cuándo el vecino confirmó que el trabajo quedó bien. Recién ahí puede calificar y se libera el pago.
  confirmado?: string;
  cancelacion?: { creado: string; motivo: string } | null;
}

export type PedidoPublico = Omit<Pedido, "clienteWhatsapp" | "claveCliente" | "idCliente" | "cuenta">;

// Una cuenta. Con Google se guarda lo mínimo: el identificador que da Google y el nombre de pila (ni mail ni foto).
// Con mail y contraseña se guarda el mail y una huella de la contraseña que no se puede dar vuelta.
export interface Cuenta {
  // "mail:direccion" o el identificador de Google.
  sub: string;
  email?: string;
  sal?: string;
  hash?: string;
  // Contraseñas equivocadas seguidas, y hasta cuándo queda frenada si se pasó.
  fallos?: number;
  bloqueadaHasta?: string;
  nombre: string;
  // Llave que guarda el celular para que lo que cree después quede unido a la cuenta.
  clave: string;
  creado: string;
}

export interface Oferta {
  id: string;
  pedidoId: string;
  prestadorId: string;
  precio: number;
  cuando: string;
  mensaje: string;
  estado: "enviada" | "elegida" | "descartada";
  creado: string;
  // true = presupuesto de muestra, generado para probar la app.
  ejemplo?: boolean;
  // Hasta cuándo leyó el chat cada lado (fecha ISO). Sirve para contar los mensajes sin leer.
  leidoVecino?: string;
  leidoPrestador?: string;
  // El prestador marcó "Trabajo terminado", con la foto del después.
  terminado?: { creado: string; fotoId: string | null } | null;
}

export type EstadoDePago = "pendiente" | "retenido" | "liberado" | "en_disputa" | "resuelto" | "vencido" | "cancelado" | "pagado";

// Un pago hecho dentro de la app por un trabajo elegido.
export interface Pago {
  id: string;
  ofertaId: string;
  pedidoId: string;
  proveedor: "cosmos" | "mercadopago";
  // protegido: la plata queda retenida en un contrato hasta que el vecino confirma · directo: va al prestador en el momento.
  modo: "protegido" | "directo";
  estado: EstadoDePago;
  montoArs: number;
  // En la moneda del proveedor (USDC en Cosmos, pesos en Mercado Pago), como texto decimal.
  monto: string;
  moneda: "USDC" | "ARS";
  comision: string;
  comisionPagada: boolean;
  // Identificadores del lado del proveedor y páginas donde se paga.
  externoId: string;
  urlDePago: string;
  comisionId?: string;
  urlDeComision?: string;
  cotizacion?: number;
  eventos: { tipo: string; creado: string }[];
  creado: string;
  actualizado: string;
}

// Lo que ven el vecino y el prestador de un pago: sin identificadores internos de más.
export interface PagoPublico {
  proveedor: Pago["proveedor"];
  modo: Pago["modo"];
  estado: EstadoDePago;
  monto: string;
  moneda: Pago["moneda"];
  montoArs: number;
  comision: string;
  comisionPagada: boolean;
  urlDePago: string;
  urlDeComision?: string;
}

// Un mensaje del chat de un presupuesto, entre el vecino dueño del pedido y el prestador que lo mandó.
export interface Mensaje {
  id: string;
  ofertaId: string;
  de: "vecino" | "prestador";
  texto: string;
  creado: string;
}

export interface PedidoParaPrestador extends PedidoPublico {
  ofertas: number;
  cupos: number;
  yaOferte: boolean;
  coincide: boolean;
  enMiZona: boolean;
  // Minutos que faltan para que el último lugar, reservado a prestadores del barrio, se abra a todos. 0 = no aplica.
  reservadoMin: number;
}

export interface Reputacion {
  // Presupuestos elegidos.
  trabajos: number;
  // Trabajos que el vecino confirmó como terminados.
  terminados: number;
  // Trabajos cobrados por la app (pago protegido liberado o pago directo).
  cobrados: number;
  calificaciones: number;
  promedio: number | null;
}

export interface Resena {
  estrellas: number;
  comentario: string;
  cliente: string;
  trabajo: string;
  creado: string;
}

// Lo que cualquiera puede ver de un prestador. Nunca incluye su WhatsApp ni su id secreto.
export interface PerfilPublico extends PerfilBorrador {
  // Es el idPublico del prestador.
  id: string;
  nivel: 1 | 2 | 3;
  fotos: string[];
  reputacion: Reputacion;
  resenas: Resena[];
  // true = perfil de muestra, inventado para probar la app.
  ejemplo: boolean;
}

// Una oferta tal como la ve el vecino que hizo el pedido. No lleva el id secreto del prestador ni su teléfono.
export interface OfertaParaCliente extends Omit<Oferta, "prestadorId" | "leidoVecino" | "leidoPrestador"> {
  // Mensajes del chat con ese prestador: cuántos hay y cuántos todavía no leyó el vecino.
  mensajes: number;
  sinLeer: number;
  prestador: {
    // Es el idPublico del prestador.
    id: string;
    nombre: string;
    rubros: RubroId[];
    aniosExperiencia: number;
    descripcion: string;
    nivel: 1 | 2 | 3;
    fotos: string[];
    reputacion: Reputacion;
    // true = prestador de muestra.
    ejemplo: boolean;
    // true = cargó su billetera: se le puede pagar protegido por la app.
    cobraPorLaApp: boolean;
  };
  pago: PagoPublico | null;
}

export interface BaseDeDatos {
  prestadores: Prestador[];
  pedidos: Pedido[];
  ofertas: Oferta[];
  cuentas?: Cuenta[];
  // Puede faltar en bases creadas antes del chat: se trata como lista vacía.
  mensajes?: Mensaje[];
  pagos?: Pago[];
}
