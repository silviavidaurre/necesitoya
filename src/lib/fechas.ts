// Fechas y horas como se leen en Jujuy, sin depender de la zona horaria del celular.
const ZONA = "America/Argentina/Jujuy";

const diaYMes = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: ZONA });
const soloMes = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: ZONA });
const soloDia = new Intl.DateTimeFormat("es-AR", { day: "numeric", timeZone: ZONA });
const horaYMinutos = new Intl.DateTimeFormat("es-AR", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: ZONA });

const sinPunto = (texto: string) => texto.replace(/\.$/, "");

// "12 nov"
export function fechaCorta(iso: string) {
  return sinPunto(diaYMes.format(new Date(iso)));
}

// "10:40"
export function hora(iso: string) {
  return horaYMinutos.format(new Date(iso));
}

// { mes: "nov", dia: "12" }, para el bloque de fecha de las listas.
export function mesYDia(iso: string) {
  const fecha = new Date(iso);
  return { mes: sinPunto(soloMes.format(fecha)), dia: soloDia.format(fecha) };
}
