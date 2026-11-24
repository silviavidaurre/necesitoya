// Prueba las cuentas con mail y contraseña: crear, entrar, recuperar perfil y pedidos, cambiar de cuenta y frenos.
// Uso: node pruebas/cuenta.mjs http://localhost:3000
// Los mails y contraseñas se inventan en cada corrida y no se imprimen.
const base = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;

function ver(nombre, bien, detalle = "") {
  if (!bien) fallas += 1;
  console.log(`${bien ? "OK  " : "MAL "} ${nombre} ${detalle}`);
}

const respuestas = [];
async function j(ruta, opciones) {
  for (let intento = 0; ; intento += 1) {
    try {
      const respuesta = await fetch(base + ruta, { ...opciones, headers: { "content-type": "application/json" } });
      const cuerpo = await respuesta.json().catch(() => null);
      respuestas.push(JSON.stringify(cuerpo));
      return { estado: respuesta.status, cuerpo };
    } catch (error) {
      if (intento >= 2) throw error;
    }
  }
}
const enviar = (ruta, datos) => j(ruta, { method: "POST", body: JSON.stringify(datos) });

const marca = crypto.randomUUID().slice(0, 8);
const mailA = `prueba-a-${marca}@necesitoya.test`;
const mailB = `prueba-b-${marca}@necesitoya.test`;
const mailC = `prueba-c-${marca}@necesitoya.test`;
const claveA = crypto.randomUUID();
const claveB = crypto.randomUUID();
const claveC = crypto.randomUUID();

// La cuenta es obligatoria para anotarse y para pedir.
const datosDelPerfil = {
  nombre: "Tecnico Cuenta Prueba",
  rubros: ["plomeria"],
  zonas: ["Centro"],
  aniosExperiencia: 3,
  descripcion: "Perfil creado por la prueba de cuentas.",
  disponibilidad: "Todos los días",
};
const datosDelPedido = {
  titulo: "Prueba de cuentas: cambiar una canilla",
  descripcion: "Canilla de la cocina.",
  rubro: "plomeria",
  urgencia: "semana",
  zona: "Centro",
  precioMin: 20000,
  precioMax: 40000,
  clienteNombre: "Vecina Cuenta",
};
const sinCuenta = await enviar("/api/prestadores", { ...datosDelPerfil, idCliente: crypto.randomUUID() });
ver("sin cuenta no se puede anotar", sinCuenta.estado === 401, `(${sinCuenta.estado})`);
const pedidoSinCuenta = await enviar("/api/pedidos", { ...datosDelPedido, idCliente: crypto.randomUUID() });
ver("sin cuenta no se puede pedir", pedidoSinCuenta.estado === 401, `(${pedidoSinCuenta.estado})`);
const llaveFalsa = await enviar("/api/pedidos", { ...datosDelPedido, idCliente: crypto.randomUUID(), cuenta: crypto.randomUUID() });
ver("con una llave inventada tampoco", llaveFalsa.estado === 401, `(${llaveFalsa.estado})`);

// Crear la cuenta A y, con ella abierta, el perfil y un pedido.
const creada = await enviar("/api/cuenta", { email: mailA, contrasena: claveA });
ver("un mail nuevo crea la cuenta en el momento", creada.estado === 200 && creada.cuerpo?.nueva === true, `(${creada.estado}) ${creada.cuerpo?.error ?? ""}`);
const alta = await enviar("/api/prestadores", { ...datosDelPerfil, idCliente: crypto.randomUUID(), cuenta: creada.cuerpo?.clave });
const prestadorId = alta.cuerpo?.prestador?.id;
ver("con la cuenta abierta se anota", alta.estado === 201 && Boolean(prestadorId) && alta.cuerpo.prestador.conCuenta === true && !("cuenta" in alta.cuerpo.prestador), `(${alta.estado})`);
const segundo = await enviar("/api/prestadores", { ...datosDelPerfil, idCliente: crypto.randomUUID(), cuenta: creada.cuerpo?.clave });
ver("una cuenta, un perfil", segundo.estado === 409, `(${segundo.estado})`);
const pedido = await enviar("/api/pedidos", { ...datosDelPedido, idCliente: crypto.randomUUID(), cuenta: creada.cuerpo?.clave });
ver("con la cuenta abierta pide", pedido.estado === 201 && Boolean(pedido.cuerpo?.id), `(${pedido.estado})`);

// Entrar desde otro celular (no manda nada propio): recupera todo.
const otra = await enviar("/api/cuenta", { email: mailA.toUpperCase(), contrasena: claveA });
ver("entrar desde otro celular no crea otra cuenta", otra.estado === 200 && otra.cuerpo?.nueva === false && otra.cuerpo?.clave === creada.cuerpo?.clave, `(${otra.estado})`);
ver("recupera el perfil", otra.cuerpo?.prestadorId === prestadorId);
ver("recupera el pedido con su clave", otra.cuerpo?.pedidos?.[0]?.clave === pedido.cuerpo.clave);

const mal = await enviar("/api/cuenta", { email: mailA, contrasena: "otra-contrasena-cualquiera" });
ver("contraseña equivocada no entra", mal.estado === 401 && !mal.cuerpo?.prestadorId, `(${mal.estado})`);

const corta = await enviar("/api/cuenta", { email: mailB, contrasena: "123" });
ver("rechaza contraseña corta", corta.estado === 400, `(${corta.estado})`);
const sinArroba = await enviar("/api/cuenta", { email: "no-es-un-mail", contrasena: claveB });
ver("rechaza un mail inválido", sinArroba.estado === 400, `(${sinArroba.estado})`);

// Cambiar de cuenta en el mismo celular: la cuenta B no se lleva lo de A aunque el celular lo mande.
const cuentaB = await enviar("/api/cuenta", { email: mailB, contrasena: claveB, prestadorId, pedidos: [{ id: pedido.cuerpo.id, clave: pedido.cuerpo.clave }] });
ver("la segunda cuenta se crea", cuentaB.estado === 200 && cuentaB.cuerpo?.nueva === true, `(${cuentaB.estado})`);
ver("la segunda cuenta no se queda con el perfil de la primera", cuentaB.cuerpo?.prestadorId === null);
ver("ni con sus pedidos", cuentaB.cuerpo?.pedidos?.length === 0);

// Lo que se crea con la cuenta abierta queda unido a ella.
const pedidoB = await enviar("/api/pedidos", {
  titulo: "Prueba de cuentas: pedido de la segunda cuenta",
  descripcion: "Pintar una reja.",
  rubro: "pintura",
  urgencia: "flexible",
  zona: "Centro",
  clienteNombre: "Vecino Segundo",
  idCliente: crypto.randomUUID(),
  cuenta: cuentaB.cuerpo?.clave,
});
const deNuevoB = await enviar("/api/cuenta", { email: mailB, contrasena: claveB });
ver("un pedido hecho con la cuenta abierta queda en la cuenta", deNuevoB.cuerpo?.pedidos?.some((p) => p.id === pedidoB.cuerpo?.id) === true);
const deNuevoA = await enviar("/api/cuenta", { email: mailA, contrasena: claveA });
ver("y no aparece en la otra cuenta", deNuevoA.cuerpo?.pedidos?.every((p) => p.id !== pedidoB.cuerpo?.id) === true);

// Freno: cinco contraseñas equivocadas seguidas frenan la cuenta un rato, aunque después llegue la correcta.
await enviar("/api/cuenta", { email: mailC, contrasena: claveC });
let ultimo = 0;
for (let i = 0; i < 5; i += 1) ultimo = (await enviar("/api/cuenta", { email: mailC, contrasena: `equivocada-${i}-xxxx` })).estado;
ver("las contraseñas equivocadas responden 401", ultimo === 401, `(${ultimo})`);
const frenada = await enviar("/api/cuenta", { email: mailC, contrasena: claveC });
ver("después de 5 intentos la cuenta queda frenada", frenada.estado === 429, `(${frenada.estado})`);

// Google: un comprobante inventado nunca entra (401), o el servidor avisa que no está configurado (503).
const falso = await enviar("/api/cuenta", { credencial: "x".repeat(300) });
ver("un comprobante de Google inventado no entra", falso.estado === 401 || falso.estado === 503, `(${falso.estado})`);

const config = await j("/api/cuenta");
ver("el servidor informa si hay Google", config.estado === 200 && "google" in (config.cuerpo ?? {}), config.cuerpo?.google ? "(configurado)" : "(sin configurar)");

const todo = respuestas.join(" ");
ver(
  `en ${respuestas.length} respuestas nunca sale una contraseña, su huella ni un mail`,
  ![claveA, claveB, claveC].some((c) => todo.includes(c)) && !todo.includes('"hash"') && !todo.includes('"sal"') && !todo.includes("@necesitoya.test"),
);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} fallas.`);
process.exit(fallas === 0 ? 0 : 1);
