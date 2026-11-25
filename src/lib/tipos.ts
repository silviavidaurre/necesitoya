import type { RubroId } from "./catalogo";
import type { EstadoDeTrabajo, Turno } from "./turnos";

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
  // true = del barrio de demostración (lib/demo.ts): inventado, no cuenta en métricas y no se cruza con lo real.
  demo?: boolean;
  // Identificador del intento de alta, generado en el celular: evita perfiles duplicados al reintentar.
  idCliente?: string;
  // Cuenta a la que quedó unido. Sirve para recuperarlo en otro celular. Privado.
  cuenta?: string;
  // Billetera Stellar (G...) donde cobra los pagos protegidos. Privada: solo la usa el servidor para armar el pago.
  billetera?: string;
  // true = moderación lo sacó de la vista (por denuncias). No aparece en presupuestos nuevos.
  suspendido?: boolean;
  // Cuenta de Mercado Pago conectada (marketplace). Privada: el token nunca sale del servidor.
  mercadopago?: { usuario: string; token: string; refresco: string; vence: string };
  // Solo en la respuesta del perfil propio (no se guardan): si está unido a una cuenta y si conectó Mercado Pago.
  conCuenta?: boolean;
  conMercadoPago?: boolean;
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
  // true = del barrio de demostración (lib/demo.ts): inventado, no cuenta en métricas y no se cruza con lo real.
  demo?: boolean;
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
  // Dirección del trabajo. PRIVADA: solo la ven el vecino y el prestador elegido, y este solo mientras el trabajo
  // está activo. Se borra cuando el trabajo termina o se cancela. Nunca sale en listas ni en respuestas para otros.
  direccion?: { calle: string; referencia: string; punto?: { lat: number; lng: number } } | null;
  // true = quedó anonimizado de una cuenta de las pruebas automáticas: no cuenta en métricas y se limpia con ellas.
  dePrueba?: boolean;
}

// Cómo va el trabajo elegido: el estado actual, el turno acordado y cuándo pasó cada cosa.
export interface Trabajo {
  estado: EstadoDeTrabajo;
  turno: Turno | null;
  historial: { estado: EstadoDeTrabajo; creado: string }[];
  // Dónde está el prestador (lo manda su celular). PRIVADO: existe solo mientras va en camino, lo ve solo el vecino
  // dueño del pedido y se borra al llegar, terminar o cancelar. Ver lib/trabajo.ts.
  ubicacion?: Ubicacion;
}

export interface Ubicacion {
  lat: number;
  lng: number;
  // Precisión en metros que informa el celular.
  precision: number;
  creado: string;
}

export type PedidoPublico = Omit<Pedido, "clienteWhatsapp" | "claveCliente" | "idCliente" | "cuenta" | "direccion">;

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
  // Enlace para elegir otra contraseña que se mandó por mail (solo su huella) y cuándo vence.
  recuperacion?: { huella: string; vence: string };
  nombre: string;
  // Llave que guarda el celular para que lo que cree después quede unido a la cuenta.
  clave: string;
  creado: string;
  // A quiénes bloqueó: "p:<id del prestador>" o "c:<cuenta del vecino>". Con un bloqueo no se cruzan más.
  bloqueos?: string[];
  // true = cuenta para la revisión de Google Play: lo suyo no cuenta en las métricas.
  revision?: boolean;
  // true = cuenta de demostración (contraseña pública): lo que crea queda en el barrio demo.
  demo?: boolean;
}

// Pedido de eliminar una cuenta hecho desde la página pública, sin entrar a la app. Lo resuelve el equipo en /admin.
export interface SolicitudDeBaja {
  id: string;
  email: string;
  estado: "pendiente" | "hecha" | "sin-cuenta";
  creado: string;
  resuelta?: string;
  // Si hay correo: el enlace para confirmar la baja que se mandó al mail (solo su huella) y cuándo vence.
  confirmacion?: { huella: string; vence: string };
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
  // true = del barrio de demostración.
  demo?: boolean;
  // Hasta cuándo leyó el chat cada lado (fecha ISO). Sirve para contar los mensajes sin leer.
  leidoVecino?: string;
  leidoPrestador?: string;
  // El prestador marcó "Trabajo terminado", con la foto del después.
  terminado?: { creado: string; fotoId: string | null } | null;
  // Días y franjas en que el prestador puede ir (los ofrece al presupuestar).
  turnos?: Turno[];
  // Solo en la oferta elegida.
  trabajo?: Trabajo | null;
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
  // true = del barrio de demostración.
  demo?: boolean;
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
    // true = del barrio de demostración.
    demo?: boolean;
    // true = se le puede pagar por la app (cargó su billetera o conectó Mercado Pago).
    cobraPorLaApp: boolean;
    // true = ese pago queda retenido hasta que el vecino confirme (Cosmos, pago protegido).
    pagoProtegido: boolean;
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
  suscripciones?: Suscripcion[];
  avisos?: AvisoGuardado[];
  verificaciones?: Verificacion[];
  reclamos?: Reclamo[];
  denuncias?: Denuncia[];
  bajas?: SolicitudDeBaja[];
  // Mails a direcciones .test: no se mandan, quedan acá para las pruebas (ver integraciones/resend-correo).
  correos?: CorreoDePrueba[];
}

export interface CorreoDePrueba {
  id: string;
  para: string;
  asunto: string;
  texto: string;
  creado: string;
}

// Un celular que aceptó recibir avisos, unido a una cuenta. El endpoint lo da el navegador.
export interface Suscripcion {
  endpoint: string;
  cuenta: string;
  creado: string;
}

// Un aviso para una cuenta. El celular lo trae cuando lo despierta el push.
export interface AvisoGuardado {
  id: string;
  cuenta: string;
  tipo: string;
  titulo: string;
  texto: string;
  url: string;
  creado: string;
  entregado?: boolean;
}

// Un trámite de verificación del prestador, que alguien del equipo revisa a mano.
// dni: foto del frente del DNI y una selfie sosteniéndolo · matricula: foto de la matrícula o certificado del oficio.
export interface Verificacion {
  id: string;
  prestadorId: string;
  tipo: "dni" | "matricula";
  // Ids en el almacén de fotos privadas (empiezan con "doc-"): nunca se sirven por /api/fotos.
  documentos: string[];
  numero?: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo?: string;
  creado: string;
  revisado?: string;
}

// Un reclamo sobre un trabajo elegido. La prueba es lo que adjunta y el chat del presupuesto.
export interface Reclamo {
  id: string;
  pedidoId: string;
  ofertaId: string;
  de: "vecino" | "prestador";
  motivo: string;
  detalle: string;
  fotos: string[];
  estado: "abierto" | "resuelto";
  resolucion?: string;
  creado: string;
  resuelto?: string;
}

// Una denuncia sobre un perfil o un mensaje del chat.
export interface Denuncia {
  id: string;
  tipo: "perfil" | "mensaje";
  // Perfil: el id público del prestador · mensaje: el id del mensaje.
  objetivo: string;
  // Para un mensaje: el presupuesto donde está la conversación.
  ofertaId?: string;
  motivo: string;
  detalle: string;
  cuenta: string;
  estado: "abierta" | "resuelta" | "descartada";
  creado: string;
  resuelta?: string;
}
