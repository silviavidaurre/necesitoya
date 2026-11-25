import { huella } from "./contrasenas";
import { completarDiagnostico } from "./diagnostico";
import { nuevoId } from "./db";
import type { RubroId } from "./catalogo";
import type { BaseDeDatos, Calificacion, Cuenta, Mensaje, Oferta, Pedido, Prestador, Reclamo } from "./tipos";
import { hoyEnJujuy, sumarDias, textoDeTurno, type EstadoDeTrabajo, type Franja, type Turno } from "./turnos";

// Barrio de demostración: prestadores, vecinos, pedidos, chats y reseñas INVENTADOS, para que el jurado vea la app
// con gente adentro. Todo va marcado con `demo: true`:
//   - no cuenta en las métricas ni en los números públicos;
//   - no se cruza con lo real: los prestadores demo solo ven y presupuestan pedidos demo, y los reales nunca los ven;
//   - lo que haga después una cuenta de demostración (un pedido nuevo, un perfil) también queda marcado como demo;
//   - se carga o se borra desde /admin (Barrio demo), sin tocar nada real.
// Las fotos de trabajos son ilustraciones propias (public/demo/*.svg), nunca fotos de personas ni de internet.
// Nombres y direcciones son inventados; los barrios son los del catálogo de la app.

export const CUENTAS_DEMO = {
  vecina: { email: "vecina@necesitoya.demo", nombre: "Carla" },
  prestador: { email: "prestador@necesitoya.demo", nombre: "Ramiro" },
} as const;
// Contraseña pública de las dos cuentas de demostración (está en el README): no protege nada real.
export const CONTRASENA_DEMO = "demo2026";

export function esCuentaDemo(db: BaseDeDatos, sub: string | undefined | null) {
  return Boolean(sub && db.cuentas?.some((c) => c.sub === sub && c.demo));
}

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

interface FichaDePrestador {
  clave: string;
  nombre: string;
  rubros: RubroId[];
  zonas: string[];
  anios: number;
  nivel: 1 | 2 | 3;
  fotos: string[];
  descripcion: string;
  disponibilidad: string;
}

const PRESTADORES: FichaDePrestador[] = [
  { clave: "ramiro", nombre: "Ramiro Tolaba", rubros: ["plomeria"], zonas: ["Alto Comedero", "Centro", "Ciudad de Nieva", "Los Perales"], anios: 14, nivel: 3, fotos: ["demo-plomeria-1", "demo-plomeria-2", "demo-plomeria-3"], descripcion: "Plomero matriculado. Destapaciones, termotanques, pérdidas y baños completos. Doy 90 días de garantía.", disponibilidad: "Lunes a sábado de 8 a 20" },
  { clave: "marcela", nombre: "Marcela Sajama", rubros: ["plomeria"], zonas: ["Alto Comedero", "Cuyaya", "Centro"], anios: 3, nivel: 1, fotos: [], descripcion: "Hago arreglos de plomería en casas: canillas, flexibles, depósitos de inodoro y pérdidas chicas.", disponibilidad: "Tardes y sábados" },
  { clave: "sergio", nombre: "Sergio Mamaní", rubros: ["gas", "plomeria"], zonas: ["Alto Comedero", "Los Perales", "Palpalá"], anios: 20, nivel: 3, fotos: ["demo-gas-1", "demo-gas-2"], descripcion: "Gasista matriculado. Instalaciones nuevas, pruebas de hermeticidad, calefones, termotanques y estufas.", disponibilidad: "Lunes a viernes de 8 a 18" },
  { clave: "lucia", nombre: "Lucía Cruz", rubros: ["electricidad"], zonas: ["Centro", "Cuyaya", "Gorriti", "Alto Comedero"], anios: 9, nivel: 3, fotos: ["demo-electricidad-1", "demo-electricidad-2"], descripcion: "Electricista matriculada. Tableros, térmicas y disyuntores, cableado nuevo y ventiladores de techo.", disponibilidad: "Todos los días, urgencias incluidas" },
  { clave: "walter", nombre: "Walter Choque", rubros: ["pintura"], zonas: ["Los Perales", "Ciudad de Nieva", "Alto Comedero"], anios: 6, nivel: 1, fotos: ["demo-pintura-1"], descripcion: "Pintor. Interiores y exteriores, látex y esmalte. Cubro muebles y piso y dejo limpio.", disponibilidad: "Lunes a sábado" },
  { clave: "nelson", nombre: "Nelson Vilte", rubros: ["albanileria"], zonas: ["Alto Comedero", "Palpalá", "San Pedrito"], anios: 22, nivel: 2, fotos: ["demo-albanileria-1"], descripcion: "Albañil. Revoques, contrapisos, cerámicos y paredes de ladrillo. Presupuesto sin cargo.", disponibilidad: "Lunes a viernes" },
  { clave: "rosa", nombre: "Rosa Guanuco", rubros: ["limpieza"], zonas: ["Centro", "Gorriti", "Cuyaya"], anios: 5, nivel: 2, fotos: ["demo-limpieza-1"], descripcion: "Limpieza de casas y de fin de obra. Llevo los productos.", disponibilidad: "Mañanas de lunes a sábado" },
  { clave: "diego", nombre: "Diego Arjona", rubros: ["jardineria"], zonas: ["Yala", "Los Perales", "Villa Jardín de Reyes"], anios: 4, nivel: 1, fotos: ["demo-jardin-1"], descripcion: "Corte de pasto, desmalezado y poda chica. Tengo cortadora y bordeadora.", disponibilidad: "Fines de semana y tardes" },
  { clave: "hernan", nombre: "Hernán Quipildor", rubros: ["mudanzas"], zonas: ["Centro", "Alto Comedero", "Palpalá", "Los Perales"], anios: 11, nivel: 2, fotos: ["demo-fletes-1"], descripcion: "Fletes y mudanzas con camioneta cerrada. Ayudo a cargar y descargar.", disponibilidad: "Todos los días" },
];

// Trabajos pasados de cada prestador, para su historial y sus reseñas.
const HISTORIAL: Record<string, { titulo: string; precio: number; estrellas: number; comentario: string; cliente: string; dias: number }[]> = {
  ramiro: [
    { titulo: "Cambio de flexible del lavatorio", precio: 25000, estrellas: 5, comentario: "Llegó a horario y dejó todo limpio.", cliente: "Graciela", dias: 9 },
    { titulo: "Destapar la cloaca del patio", precio: 60000, estrellas: 5, comentario: "Vino con la máquina y lo resolvió en una hora.", cliente: "Pablo", dias: 23 },
    { titulo: "Instalar termotanque nuevo", precio: 95000, estrellas: 4, comentario: "Buen trabajo. Tardó un poco más de lo que dijo.", cliente: "Mónica", dias: 41 },
  ],
  marcela: [{ titulo: "Arreglar el depósito del inodoro", precio: 22000, estrellas: 5, comentario: "Muy amable y explicó todo.", cliente: "Andrea", dias: 15 }],
  sergio: [
    { titulo: "Prueba de hermeticidad para el gas", precio: 70000, estrellas: 5, comentario: "Hizo la prueba y me dejó el certificado.", cliente: "Raúl", dias: 12 },
    { titulo: "Calefón que se apaga solo", precio: 45000, estrellas: 5, comentario: "Era la termocupla. Rápido y prolijo.", cliente: "Viviana", dias: 37 },
  ],
  lucia: [
    { titulo: "Instalar dos ventiladores de techo", precio: 50000, estrellas: 5, comentario: "Excelente, súper prolija.", cliente: "Federico", dias: 6 },
    { titulo: "Cambiar el tablero viejo", precio: 120000, estrellas: 5, comentario: "Me explicó qué estaba mal y lo dejó con disyuntor.", cliente: "Beatriz", dias: 28 },
    { titulo: "Enchufe que hace chispa", precio: 18000, estrellas: 4, comentario: "Bien. Vino al otro día.", cliente: "Óscar", dias: 52 },
  ],
  walter: [{ titulo: "Pintar la fachada", precio: 180000, estrellas: 4, comentario: "Quedó linda. Hubo que repasar una parte.", cliente: "Patricia", dias: 33 }],
  nelson: [
    { titulo: "Contrapiso del lavadero", precio: 140000, estrellas: 5, comentario: "Cumplió con lo que dijo.", cliente: "Luis", dias: 19 },
    { titulo: "Revocar una pared de 12 m²", precio: 90000, estrellas: 5, comentario: "Trabajador y prolijo.", cliente: "Silvana", dias: 45 },
  ],
  rosa: [
    { titulo: "Limpieza de fin de obra", precio: 65000, estrellas: 5, comentario: "Dejó la casa impecable.", cliente: "Noelia", dias: 8 },
    { titulo: "Limpieza a fondo antes de mudarnos", precio: 50000, estrellas: 5, comentario: "Muy confiable.", cliente: "Gustavo", dias: 30 },
  ],
  diego: [{ titulo: "Cortar el pasto del frente y el fondo", precio: 20000, estrellas: 4, comentario: "Bien. Dejó el pasto cortado juntado.", cliente: "Hugo", dias: 11 }],
  hernan: [
    { titulo: "Mudanza de un monoambiente", precio: 70000, estrellas: 5, comentario: "Cuidó los muebles y fue puntual.", cliente: "Camila", dias: 14 },
    { titulo: "Llevar una heladera a Palpalá", precio: 30000, estrellas: 5, comentario: "Rápido y barato.", cliente: "Marcos", dias: 40 },
  ],
};

const FOTO_DEL_RUBRO: Partial<Record<RubroId, string>> = {
  plomeria: "demo-plomeria-1",
  gas: "demo-gas-1",
  electricidad: "demo-electricidad-1",
  pintura: "demo-pintura-1",
  albanileria: "demo-albanileria-1",
  limpieza: "demo-limpieza-1",
  jardineria: "demo-jardin-1",
  mudanzas: "demo-fletes-1",
};

// Arma el barrio entero. `clavesPrevias` mantiene la llave de las cuentas demo entre recargas (así no se cierra
// la sesión de quien ya había entrado).
export async function armarBarrioDemo(clavesPrevias: Partial<Record<"vecina" | "prestador", string>> = {}, ahora = Date.now()) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const hoy = hoyEnJujuy(ahora);
  const turno = (dias: number, franja: Franja): Turno => ({ dia: sumarDias(hoy, dias), franja });

  // --- Cuentas para entrar sin registrarse -------------------------------------------------------
  const cuentas: Cuenta[] = [];
  for (const tipo of ["vecina", "prestador"] as const) {
    const { email, nombre } = CUENTAS_DEMO[tipo];
    const sal = nuevoId();
    cuentas.push({ sub: `mail:${email}`, email, sal, hash: await huella(CONTRASENA_DEMO, sal), nombre, clave: clavesPrevias[tipo] ?? nuevoId(), creado: iso(ahora - 60 * DIA), demo: true });
  }
  const subVecina = `mail:${CUENTAS_DEMO.vecina.email}`;
  const subPrestador = `mail:${CUENTAS_DEMO.prestador.email}`;

  // --- Prestadores ---------------------------------------------------------------------------------
  const prestadores: Prestador[] = PRESTADORES.map((f, i) => ({
    id: nuevoId(),
    idPublico: nuevoId(),
    nombre: f.nombre,
    rubros: f.rubros,
    zonas: f.zonas,
    aniosExperiencia: f.anios,
    descripcion: f.descripcion,
    disponibilidad: f.disponibilidad,
    whatsapp: "",
    nivel: f.nivel,
    transcripcion: "",
    creado: iso(ahora - (90 - i * 5) * DIA),
    fotos: f.fotos,
    demo: true,
    ...(f.clave === "ramiro" ? { cuenta: subPrestador } : {}),
  }));
  const p = Object.fromEntries(PRESTADORES.map((f, i) => [f.clave, prestadores[i]])) as Record<string, Prestador>;

  const pedidos: Pedido[] = [];
  const ofertas: Oferta[] = [];
  const mensajes: Mensaje[] = [];
  const reclamos: Reclamo[] = [];

  const nuevoPedido = (datos: Partial<Pedido> & Pick<Pedido, "titulo" | "descripcion" | "rubro" | "zona" | "clienteNombre" | "creado">): Pedido => {
    const pedido: Pedido = {
      id: nuevoId(),
      urgencia: "semana",
      precioMin: null,
      precioMax: null,
      ejemplo: false,
      estado: "abierto",
      relato: datos.descripcion,
      fotoId: null,
      claveCliente: nuevoId(),
      cuenta: `demo:vecino-${pedidos.length + 1}`,
      demo: true,
      ...datos,
    };
    pedidos.push(pedido);
    return pedido;
  };
  const nuevaOferta = (pedido: Pedido, prestador: Prestador, precio: number, minutosDespues: number, mensaje: string, turnos: Turno[]): Oferta => {
    const oferta: Oferta = {
      id: nuevoId(),
      pedidoId: pedido.id,
      prestadorId: prestador.id,
      precio,
      cuando: turnos[0] ? textoDeTurno(turnos[0], ahora) : "Esta semana",
      mensaje,
      estado: "enviada",
      creado: iso(Date.parse(pedido.creado) + minutosDespues * MIN),
      turnos,
      demo: true,
    };
    ofertas.push(oferta);
    return oferta;
  };
  const charla = (oferta: Oferta, lineas: [Mensaje["de"], string, number][]) => {
    for (const [de, texto, minutosAtras] of lineas) mensajes.push({ id: nuevoId(), ofertaId: oferta.id, de, texto, creado: iso(ahora - minutosAtras * MIN) });
  };
  // Elige la oferta: el resto queda descartado y el trabajo avanza por los estados indicados.
  const elegir = (pedido: Pedido, oferta: Oferta, t: Turno, estados: [EstadoDeTrabajo, number][]) => {
    for (const o of ofertas.filter((x) => x.pedidoId === pedido.id)) o.estado = o.id === oferta.id ? "elegida" : "descartada";
    pedido.estado = "cerrado";
    oferta.cuando = textoDeTurno(t, ahora);
    oferta.trabajo = { estado: estados[estados.length - 1][0], turno: t, historial: estados.map(([estado, minutosAtras]) => ({ estado, creado: iso(ahora - minutosAtras * MIN) })) };
  };
  const terminar = (pedido: Pedido, oferta: Oferta, diasAtras: number, calificacion: Omit<Calificacion, "creado"> | null) => {
    const fin = ahora - diasAtras * DIA;
    oferta.terminado = { creado: iso(fin - 2 * HORA), fotoId: FOTO_DEL_RUBRO[pedido.rubro] ?? null };
    if (oferta.trabajo) {
      oferta.trabajo.estado = "terminado";
      oferta.trabajo.historial.push({ estado: "terminado", creado: iso(fin - 2 * HORA) });
    }
    pedido.confirmado = iso(fin);
    // Como en un trabajo real: la dirección se borra cuando el trabajo termina.
    pedido.direccion = null;
    if (calificacion) pedido.calificacion = { ...calificacion, creado: iso(fin + HORA) };
  };
  const diagnostico = (rubro: RubroId, texto: string, causa: string, queHacerYa: string[], materiales: string[]) =>
    completarDiagnostico({ causa, riesgo: "medio", queHacerYa, materiales, preguntas: [] }, rubro, texto);

  // --- Historial: trabajos terminados y calificados de cada prestador -------------------------------
  for (const [clave, trabajos] of Object.entries(HISTORIAL)) {
    const prestador = p[clave];
    trabajos.forEach((t, i) => {
      const zona = prestador.zonas[i % prestador.zonas.length];
      const pedido = nuevoPedido({ titulo: t.titulo, descripcion: `${t.titulo}.`, rubro: prestador.rubros[0], zona, clienteNombre: t.cliente, creado: iso(ahora - (t.dias + 2) * DIA) });
      const oferta = nuevaOferta(pedido, prestador, t.precio, 35 + i * 10, "", []);
      elegir(pedido, oferta, { dia: sumarDias(hoy, -t.dias), franja: "manana" }, [["confirmado", (t.dias + 1) * 24 * 60], ["en_camino", t.dias * 24 * 60 + 300], ["llego", t.dias * 24 * 60 + 280], ["trabajando", t.dias * 24 * 60 + 275]]);
      terminar(pedido, oferta, t.dias, { estrellas: t.estrellas, comentario: t.comentario });
    });
  }

  // --- Carla (cuenta de demostración del vecino): un pedido en cada estado --------------------------
  const deCarla = { cuenta: subVecina, clienteNombre: "Carla Medina", zona: "Alto Comedero" };

  // 1. Abierto, con tres presupuestos para comparar.
  const termotanque = nuevoPedido({
    ...deCarla,
    titulo: "Termotanque pierde agua por abajo y no calienta",
    descripcion: "El termotanque a gas de 80 litros pierde agua por abajo y ya no calienta. Tiene unos 10 años.",
    relato: "se me rompió el termotanque pierde agua por abajo y no calienta nada, necesito que alguien venga hoy",
    rubro: "plomeria",
    urgencia: "hoy",
    precioMin: 60000,
    precioMax: 110000,
    creado: iso(ahora - 50 * MIN),
    diagnostico: diagnostico(
      "plomeria",
      "termotanque a gas pierde agua",
      "Lo más probable es que el tanque interno esté perforado por corrosión, algo común después de 8 a 10 años; si pierde por el fondo, muchas veces conviene cambiarlo.",
      ["Cerrá la llave de paso de agua que entra al termotanque", "Poné un balde o trapos abajo"],
      ["Termotanque nuevo de 80 litros, si el tanque está perforado", "Flexibles de agua y de gas"],
    ),
  });
  const deRamiro = nuevaOferta(termotanque, p.ramiro, 78000, 12, "Llevo la válvula y los flexibles. Si el tanque está picado te paso el precio del cambio completo.", [turno(0, "tarde"), turno(1, "manana")]);
  const deMarcela = nuevaOferta(termotanque, p.marcela, 72000, 20, "Puedo ir mañana a la mañana a ver qué tiene.", [turno(1, "manana")]);
  nuevaOferta(termotanque, p.sergio, 89000, 31, "Como es a gas, reviso también la conexión y el piloto. Soy matriculado.", [turno(0, "noche"), turno(2, "tarde")]);
  charla(deMarcela, [
    ["vecino", "Hola Marcela, ¿el precio incluye el flexible?", 18],
    ["prestador", "Hola Carla. Sí, incluye flexible y mano de obra. Si hay que cambiar el termotanque es aparte.", 15],
  ]);
  deMarcela.leidoVecino = iso(ahora - 14 * MIN);
  void deRamiro;

  // 2. Elegido y en camino (con Ramiro, la cuenta de demostración del prestador).
  const inodoro = nuevoPedido({ ...deCarla, titulo: "Se tapó el inodoro del baño de arriba", descripcion: "El inodoro del baño de arriba se tapó y el agua sube. Probé con sopapa y no baja.", rubro: "plomeria", urgencia: "hoy", precioMin: 30000, precioMax: 60000, creado: iso(ahora - 3 * HORA) });
  const inodoroRamiro = nuevaOferta(inodoro, p.ramiro, 45000, 15, "Voy con la sonda. Si es la cañería principal te aviso antes de seguir.", [turno(0, "tarde")]);
  nuevaOferta(inodoro, p.marcela, 40000, 40, "Puedo mañana a la tarde.", [turno(1, "tarde")]);
  elegir(inodoro, inodoroRamiro, turno(0, "tarde"), [["confirmado", 140], ["en_camino", 8]]);
  // Puntos inventados en Alto Comedero, para el mapa real: la casa y dónde viene Ramiro (en la demo no vence).
  inodoro.direccion = { calle: "Calle Demo 120 (dirección inventada)", referencia: "Portón negro", punto: { lat: -24.2412, lng: -65.2618 } };
  if (inodoroRamiro.trabajo) inodoroRamiro.trabajo.ubicacion = { lat: -24.2361, lng: -65.2683, precision: 15, creado: iso(ahora - MIN) };
  charla(inodoroRamiro, [
    ["vecino", "Hola Ramiro, te elegí. ¿Venís a la tarde?", 135],
    ["prestador", "Hola Carla, sí. Tipo 14 estoy por allá.", 130],
    ["prestador", "Ya salí para tu casa, en 15 minutos llego.", 8],
  ]);
  inodoroRamiro.leidoVecino = iso(ahora - 20 * MIN);
  inodoroRamiro.leidoPrestador = iso(ahora - 8 * MIN);

  // 3. En curso: la electricista ya está trabajando.
  const termica = nuevoPedido({
    ...deCarla,
    titulo: "Salta la térmica cuando enchufo el lavarropas",
    descripcion: "Cada vez que prendo el lavarropas salta la térmica de toda la casa.",
    rubro: "electricidad",
    urgencia: "semana",
    precioMin: 25000,
    precioMax: 50000,
    creado: iso(ahora - 26 * HORA),
    diagnostico: diagnostico("electricidad", "salta la térmica con el lavarropas", "Lo más probable es que haya una fuga a tierra en el lavarropas o en ese enchufe, o que la térmica esté vencida.", [], ["Térmica bipolar de 20 A", "Toma con tierra"]),
  });
  const termicaLucia = nuevaOferta(termica, p.lucia, 35000, 25, "Reviso el circuito con el medidor y cambio lo que haga falta. Soy matriculada.", [turno(0, "manana")]);
  elegir(termica, termicaLucia, turno(0, "manana"), [["confirmado", 20 * 60], ["en_camino", 95], ["llego", 70], ["trabajando", 62]]);
  termica.direccion = { calle: "Calle Demo 120 (dirección inventada)", referencia: "Portón negro", punto: { lat: -24.2412, lng: -65.2618 } };
  charla(termicaLucia, [
    ["prestador", "Llegué. El problema era el toma del lavadero, no tenía tierra. Lo estoy cambiando.", 55],
    ["vecino", "Genial, gracias Lucía.", 50],
  ]);
  termicaLucia.leidoVecino = iso(ahora - 50 * MIN);
  termicaLucia.leidoPrestador = iso(ahora - 50 * MIN);

  // 4. Terminado y calificado.
  const living = nuevoPedido({ ...deCarla, titulo: "Pintar el living y el pasillo", descripcion: "Living de 4 por 5 y pasillo, paredes y techo, látex blanco.", rubro: "pintura", creado: iso(ahora - 16 * DIA), precioMin: 120000, precioMax: 200000 });
  const livingWalter = nuevaOferta(living, p.walter, 150000, 60, "Con materiales incluidos. Dos manos.", []);
  elegir(living, livingWalter, { dia: sumarDias(hoy, -13), franja: "manana" }, [["confirmado", 15 * 24 * 60], ["en_camino", 13 * 24 * 60 + 200], ["llego", 13 * 24 * 60 + 180], ["trabajando", 13 * 24 * 60 + 175]]);
  terminar(living, livingWalter, 12, { estrellas: 5, comentario: "Prolijo y puntual. Cubrió todos los muebles." });
  charla(livingWalter, [
    ["vecino", "¿Traés vos la pintura?", 15 * 24 * 60],
    ["prestador", "Sí, látex blanco lavable. Lo incluí en el precio.", 15 * 24 * 60 - 10],
  ]);

  // 5. Con un reclamo resuelto.
  const medianera = nuevoPedido({ ...deCarla, titulo: "Arreglar el revoque de la medianera", descripcion: "Se cayó el revoque de un pedazo de la medianera del patio, unos 3 metros.", rubro: "albanileria", creado: iso(ahora - 34 * DIA), precioMin: 60000, precioMax: 100000 });
  const medianeraNelson = nuevaOferta(medianera, p.nelson, 80000, 90, "Pico lo flojo y revoco de nuevo con hidrófugo.", []);
  elegir(medianera, medianeraNelson, { dia: sumarDias(hoy, -30), franja: "manana" }, [["confirmado", 33 * 24 * 60], ["en_camino", 30 * 24 * 60 + 300], ["llego", 30 * 24 * 60 + 280], ["trabajando", 30 * 24 * 60 + 275]]);
  terminar(medianera, medianeraNelson, 25, { estrellas: 4, comentario: "Tuvo que volver a repasar una parte, pero cumplió y no cobró de más." });
  reclamos.push({
    id: nuevoId(),
    pedidoId: medianera.id,
    ofertaId: medianeraNelson.id,
    de: "vecino",
    motivo: "Quedó mal hecho",
    detalle: "A la semana se fisuró una parte del revoque nuevo.",
    fotos: [],
    estado: "resuelto",
    resolucion: "Nelson volvió a repasar la parte fisurada sin costo y Carla confirmó que quedó bien.",
    creado: iso(ahora - 28 * DIA),
    resuelto: iso(ahora - 25 * DIA),
  });
  charla(medianeraNelson, [
    ["vecino", "Nelson, se fisuró una parte del revoque.", 28 * 24 * 60],
    ["prestador", "Uh, perdón. El jueves paso y lo repaso sin cargo.", 28 * 24 * 60 - 30],
    ["vecino", "Quedó bien ahora, gracias.", 25 * 24 * 60],
  ]);

  // --- Otros vecinos: pedidos abiertos para que el prestador de demostración presupueste ------------
  const canilla = nuevoPedido({ titulo: "Pierde la canilla del lavadero", descripcion: "La canilla del lavadero gotea todo el día aunque la cierre fuerte.", rubro: "plomeria", zona: "Los Perales", clienteNombre: "Elena Farfán", urgencia: "semana", precioMin: 15000, precioMax: 30000, creado: iso(ahora - 35 * MIN) });
  nuevaOferta(canilla, p.marcela, 18000, 14, "Cambio el cuerito o la canilla entera si hace falta.", [turno(1, "tarde")]);
  nuevoPedido({ titulo: "Instalar un ventilador de techo en el dormitorio", descripcion: "Ya compré el ventilador. Hay boca de luz en el techo.", rubro: "electricidad", zona: "Cuyaya", clienteNombre: "Jorge Ríos", urgencia: "flexible", precioMin: 20000, precioMax: 35000, creado: iso(ahora - 2 * HORA) });
  nuevoPedido({ titulo: "Cambiar el sifón de la pileta de la cocina", descripcion: "El sifón está rajado y pierde cuando uso la pileta.", rubro: "plomeria", zona: "Centro", clienteNombre: "Noelia Burgos", urgencia: "hoy", precioMin: 15000, precioMax: 30000, creado: iso(ahora - 12 * MIN) });
  const mudanza = nuevoPedido({ titulo: "Mudanza de un departamento de dos ambientes", descripcion: "De Alto Comedero a Palpalá. Heladera, cama, mesa, sillas y unas 15 cajas.", rubro: "mudanzas", zona: "Alto Comedero", clienteNombre: "Matías Condorí", urgencia: "semana", precioMin: 70000, precioMax: 120000, creado: iso(ahora - 5 * HORA) });
  nuevaOferta(mudanza, p.hernan, 85000, 30, "Con camioneta cerrada y un ayudante.", [turno(2, "manana"), turno(3, "manana")]);
  nuevoPedido({ titulo: "Cortar el pasto y desmalezar el fondo", descripcion: "Fondo de unos 10 por 15 con yuyos altos.", rubro: "jardineria", zona: "Yala", clienteNombre: "Paola Ibarra", urgencia: "flexible", precioMin: 18000, precioMax: 35000, creado: iso(ahora - 7 * HORA) });

  return { cuentas, prestadores, pedidos, ofertas, mensajes, reclamos };
}

// Qué es del barrio demo dentro de la base (para borrarlo o recargarlo sin tocar nada real).
export function deLaDemo(db: BaseDeDatos) {
  const cuentas = new Set((db.cuentas ?? []).filter((c) => c.demo).map((c) => c.sub));
  const pedidos = new Set(db.pedidos.filter((x) => x.demo || (x.cuenta && cuentas.has(x.cuenta))).map((x) => x.id));
  const prestadores = new Set(db.prestadores.filter((x) => x.demo || (x.cuenta && cuentas.has(x.cuenta))).map((x) => x.id));
  const ofertas = new Set(db.ofertas.filter((o) => o.demo || pedidos.has(o.pedidoId) || prestadores.has(o.prestadorId)).map((o) => o.id));
  // Fotos subidas al almacén desde las cuentas demo (las ilustraciones "demo-..." son archivos fijos y no se borran).
  const subidas = [
    ...db.pedidos.filter((x) => pedidos.has(x.id)).map((x) => x.fotoId),
    ...db.prestadores.filter((x) => prestadores.has(x.id)).flatMap((x) => x.fotos ?? []),
    ...db.ofertas.filter((o) => ofertas.has(o.id)).map((o) => o.terminado?.fotoId),
    ...(db.reclamos ?? []).filter((r) => ofertas.has(r.ofertaId)).flatMap((r) => r.fotos),
  ].filter((id): id is string => Boolean(id) && !String(id).startsWith("demo-"));
  return { cuentas, pedidos, prestadores, ofertas, fotos: subidas };
}

// Saca de la base todo lo del barrio demo. Devuelve las fotos subidas a borrar del almacén.
export function quitarDemo(db: BaseDeDatos) {
  const demo = deLaDemo(db);
  db.pedidos = db.pedidos.filter((x) => !demo.pedidos.has(x.id));
  db.prestadores = db.prestadores.filter((x) => !demo.prestadores.has(x.id));
  db.ofertas = db.ofertas.filter((o) => !demo.ofertas.has(o.id));
  db.mensajes = (db.mensajes ?? []).filter((m) => !demo.ofertas.has(m.ofertaId));
  db.pagos = (db.pagos ?? []).filter((x) => !demo.ofertas.has(x.ofertaId));
  db.reclamos = (db.reclamos ?? []).filter((r) => !demo.ofertas.has(r.ofertaId));
  db.verificaciones = (db.verificaciones ?? []).filter((v) => !demo.prestadores.has(v.prestadorId));
  db.denuncias = (db.denuncias ?? []).filter((d) => !demo.cuentas.has(d.cuenta) && !demo.ofertas.has(d.ofertaId ?? ""));
  db.suscripciones = (db.suscripciones ?? []).filter((s) => !demo.cuentas.has(s.cuenta));
  db.avisos = (db.avisos ?? []).filter((a) => !demo.cuentas.has(a.cuenta));
  db.cuentas = (db.cuentas ?? []).filter((c) => !demo.cuentas.has(c.sub));
  return { ...demo, fotos: demo.fotos };
}

export function resumenDemo(db: BaseDeDatos) {
  const demo = deLaDemo(db);
  return { cuentas: demo.cuentas.size, prestadores: demo.prestadores.size, pedidos: demo.pedidos.size, presupuestos: demo.ofertas.size };
}
