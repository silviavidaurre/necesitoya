// Prueba lo nuevo: presupuestos de muestra, pedidos sin duplicar al reintentar y la lista abierta sin anotarse.
// Uso: node pruebas/muestra.mjs http://localhost:3000
import { cuentaDePrueba } from "./comun.mjs";
const base = process.argv[2] ?? "http://localhost:3000";
let fallas = 0;

function ver(nombre, bien, detalle = "") {
  if (!bien) fallas += 1;
  console.log(`${bien ? "OK  " : "MAL "} ${nombre} ${detalle}`);
}

// Todo lo que responde el servidor se junta acá: al final se revisa que nunca haya salido un teléfono.
const respuestas = [];
async function j(ruta, opciones) {
  const respuesta = await fetch(base + ruta, { ...opciones, headers: { "content-type": "application/json" } });
  const cuerpo = await respuesta.json().catch(() => null);
  respuestas.push(JSON.stringify(cuerpo));
  return { estado: respuesta.status, cuerpo };
}

const antes = (await j("/api/stats")).cuerpo;

const idCliente = crypto.randomUUID();
const pedido = {
  titulo: "Prueba de muestra: destapar una pileta",
  descripcion: "La pileta de la cocina no desagota.",
  rubro: "plomeria",
  urgencia: "hoy",
  zona: "Centro",
  precioMin: 20000,
  precioMax: 40000,
  relato: "se tapó la pileta",
  clienteNombre: "Vecina De Prueba",
  // Ya no se pide. Se manda igual, como haría una versión vieja de la app, para comprobar que no se le muestra a nadie.
  clienteWhatsapp: "388 4123456",
  idCliente,
  cuenta: await cuentaDePrueba(base, "vecina"),
};
const primero = await j("/api/pedidos", { method: "POST", body: JSON.stringify(pedido) });
ver("publica el pedido", (primero.estado === 200 || primero.estado === 201) && Boolean(primero.cuerpo?.id), `(${primero.estado})`);
const segundo = await j("/api/pedidos", { method: "POST", body: JSON.stringify(pedido) });
ver("reintentar no lo duplica", segundo.cuerpo?.id === primero.cuerpo?.id && segundo.cuerpo?.clave === primero.cuerpo?.clave);

const { id, clave } = primero.cuerpo;

const lista = await j("/api/pedidos");
const enLista = lista.cuerpo?.pedidos?.find((p) => p.id === id);
ver("la lista se ve sin anotarse", lista.estado === 200 && Boolean(enLista));
ver("la lista muestra solo el nombre de pila", enLista?.clienteNombre === "Vecina", String(enLista?.clienteNombre));
ver("la lista no trae teléfono ni clave", !JSON.stringify(lista.cuerpo).includes("4123456") && !JSON.stringify(lista.cuerpo).includes(clave));

const ajeno = await j("/api/pedido/muestra", { method: "POST", body: JSON.stringify({ id, clave: "otra" }) });
ver("otro no puede pedir la muestra", ajeno.estado === 403, `(${ajeno.estado})`);

const muestra = await j("/api/pedido/muestra", { method: "POST", body: JSON.stringify({ id, clave }) });
const ofertas = muestra.cuerpo?.ofertas ?? [];
ver("llegan 2 presupuestos de muestra", muestra.estado === 200 && ofertas.length === 2, `(${muestra.estado}, ${ofertas.length})`);
ver("van marcados como de muestra", ofertas.every((o) => o.ejemplo === true && o.prestador.ejemplo === true));
ver("no traen teléfono ni id secreto", ofertas.every((o) => !("whatsapp" in o.prestador) && !("prestadorId" in o)));
ver("los precios caen en el rango", ofertas.every((o) => o.precio >= 20000 && o.precio <= 40000), ofertas.map((o) => o.precio).join(", "));
ver("el primero hace ese oficio", ofertas[0]?.prestador.rubros.includes("plomeria"));

const perfil = await j(`/api/perfil?id=${encodeURIComponent(ofertas[0]?.prestador.id ?? "")}`);
ver("el perfil de muestra se puede ver", perfil.estado === 200 && perfil.cuerpo?.perfil?.ejemplo === true, `(${perfil.estado})`);

const elegir = await j("/api/pedido/elegir", { method: "POST", body: JSON.stringify({ id, clave, ofertaId: ofertas[0]?.id }) });
const elegida = elegir.cuerpo?.ofertas?.find((o) => o.estado === "elegida");
ver("se puede elegir uno de muestra", elegir.estado === 200 && Boolean(elegida), `(${elegir.estado})`);
ver("el de muestra no trae teléfono", Boolean(elegida) && !("whatsapp" in elegida.prestador));

// Con los de muestra no hay nadie del otro lado: el chat se puede mirar, pero no se abre para escribir.
const chat = await j(`/api/chat?ofertaId=${elegida?.id}&pedidoId=${id}&clave=${encodeURIComponent(clave)}`);
ver("el chat de un presupuesto de muestra avisa que es de muestra", chat.estado === 200 && chat.cuerpo?.abierto === false && chat.cuerpo?.motivo === "muestra", `(${chat.estado}, ${chat.cuerpo?.motivo})`);
const escribir = await j("/api/chat", { method: "POST", body: JSON.stringify({ ofertaId: elegida?.id, pedidoId: id, clave, texto: "Hola, ¿podés venir hoy?" }) });
ver("no se le puede escribir a un prestador de muestra", escribir.estado === 409, `(${escribir.estado}) ${escribir.cuerpo?.error ?? ""}`);
const todo = respuestas.join(" ");
ver(`en ${respuestas.length} respuestas nunca sale un teléfono`, !todo.includes("4123456") && !todo.includes("whatsapp") && !todo.includes("clienteWhatsapp"));

const despues = (await j("/api/stats")).cuerpo;
ver(
  "la muestra no cuenta como uso real",
  despues.pedidos === antes.pedidos && despues.ofertas === antes.ofertas && despues.prestadores === antes.prestadores,
  `${JSON.stringify(antes)} -> ${JSON.stringify(despues)}`,
);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} fallas.`);
process.exit(fallas === 0 ? 0 : 1);
